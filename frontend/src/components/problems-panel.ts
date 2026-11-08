import {
  mdiAlertCircleOutline,
  mdiAlertOutline,
  mdiCreationOutline,
  mdiDeleteOutline,
  mdiPlus,
} from "@mdi/js";
import { css, html, nothing } from "lit";

import {
  aiStatus,
  createProblem,
  deleteProblem,
  diagnoseProblem,
  errorMessage,
  getProblem,
  listProblems,
  logProblem,
  updateProblem,
} from "../api/client";
import {
  PROBLEM_STATUSES,
  type AIStatus,
  type Diagnosis,
  type GardenChangeEvent,
  type LogEntry,
  type Photo,
  type Problem,
  type ProblemDetail,
} from "../api/types";
import type { TranslationKey } from "../i18n/en";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { formatDate, formatDateTime } from "../util/format";
import { PgElement, define, icon } from "./base";
import type { PgConfirmDialog } from "./confirm-dialog";
import "./confirm-dialog";

/**
 * Problems of a plant (spec 4.7): report one with photos, follow it with a log
 * of what was done, change its status and let the AI diagnose it.
 */
export class PgProblemsPanel extends PgElement {
  static override properties = {
    store: { attribute: false },
    plantId: { attribute: false },
    photos: { attribute: false },
    _problems: { state: true },
    _details: { state: true },
    _status: { state: true },
    _busy: { state: true },
    _error: { state: true },
    _chosen: { state: true },
  };

  declare store: GardenStore;
  declare plantId: string;
  declare photos: Photo[];
  declare _problems: Problem[];
  declare _details: Record<string, LogEntry[]>;
  declare _status: AIStatus | null;
  declare _busy: string;
  declare _error: string;
  declare _chosen: Set<string>;

  private readonly _onChange = (event: Event) => {
    const change = (event as CustomEvent<GardenChangeEvent>).detail;
    if (change.kind === "care" && (!change.plant_id || change.plant_id === this.plantId)) {
      void this._load();
    }
  };

  constructor() {
    super();
    this.photos = [];
    this._problems = [];
    this._details = {};
    this._status = null;
    this._busy = "";
    this._error = "";
    this._chosen = new Set();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.store?.addEventListener("plant-changed", this._onChange);
    void this._load();
    void aiStatus(this.hass).then(
      (status) => (this._status = status),
      () => undefined,
    );
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.store?.removeEventListener("plant-changed", this._onChange);
  }

  private async _load(): Promise<void> {
    try {
      this._problems = await listProblems(this.hass, { plantId: this.plantId });
      const details = await Promise.all(
        this._problems
          .filter((p) => p.status !== "resolved")
          .map((p) => getProblem(this.hass, p.id)),
      );
      this._details = Object.fromEntries(details.map((d) => [d.problem.id, d.log]));
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private _apply(detail: ProblemDetail): void {
    this._problems = this._problems.map((p) => (p.id === detail.problem.id ? detail.problem : p));
    this._details = { ...this._details, [detail.problem.id]: detail.log };
  }

  private async _run(key: string, action: () => Promise<unknown>): Promise<void> {
    this._busy = key;
    this._error = "";
    try {
      const result = await action();
      if (result && typeof result === "object" && "problem" in result) {
        this._apply(result as ProblemDetail);
      } else await this._load();
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = "";
    }
  }

  private _openReport(): void {
    // the newest photo is preselected: usually the one that shows the problem
    this._chosen = new Set(this.photos.slice(0, 1).map((p) => p.id));
    this.renderRoot.querySelector<HTMLDialogElement>("dialog.report")?.showModal();
  }

  private async _report(event: Event): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    await this._run("report", async () => {
      await createProblem(this.hass, {
        plant_id: this.plantId,
        title: String(data.get("title") ?? "").trim(),
        note: String(data.get("note") ?? "").trim(),
        photo_ids: [...this._chosen],
      });
    });
    if (!this._error) this.renderRoot.querySelector<HTMLDialogElement>("dialog.report")?.close();
  }

  private async _log(problem: Problem, form: HTMLFormElement): Promise<void> {
    const data = new FormData(form);
    const text = String(data.get("text") ?? "").trim();
    if (!text) return;
    await this._run(problem.id, () =>
      logProblem(this.hass, problem.id, data.get("kind") as "note" | "action", text),
    );
    form.reset();
  }

  private async _delete(problem: Problem): Promise<void> {
    const confirm = this.renderRoot.querySelector<PgConfirmDialog>("pg-confirm-dialog");
    const ok = await confirm?.ask(
      this.t("problems.delete_title"),
      this.t("problems.delete_body", { title: problem.title }),
      this.t("common.delete"),
    );
    if (ok) await this._run(problem.id, () => deleteProblem(this.hass, problem.id));
  }

  protected override render() {
    const { t } = this;
    const active = this._problems.filter((p) => p.status !== "resolved");
    const resolved = this._problems.filter((p) => p.status === "resolved");
    return html`
      <div class="block-header">
        <h3>${t("problems.title")}</h3>
        <button class="button text" @click=${this._openReport}>
          ${icon(mdiPlus)} ${t("problems.report")}
        </button>
      </div>
      ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
      ${this._problems.length ? nothing : html`<p class="muted small">${t("problems.none")}</p>`}
      ${active.map((problem) => this._renderProblem(problem))}
      ${
        resolved.length
          ? html`<details>
              <summary class="small">${t("problems.resolved", { n: resolved.length })}</summary>
              ${resolved.map(
                (p) =>
                  html`<p class="small muted">
                    ${p.title} · ${formatDate(p.observed_on, this.language)}
                    ${p.resolved_at ? html`– ${formatDate(p.resolved_at, this.language)}` : nothing}
                    <button
                      class="button text small-button"
                      @click=${() =>
                        this._run(p.id, () => updateProblem(this.hass, p.id, { status: "open" }))}
                    >
                      ${t("problems.reopen")}
                    </button>
                  </p>`,
              )}
            </details>`
          : nothing
      }
      ${this._renderReport()}
      <pg-confirm-dialog .hass=${this.hass}></pg-confirm-dialog>
    `;
  }

  private _renderProblem(problem: Problem) {
    const { t, language } = this;
    const photos = problem.photo_ids
      .map((id) => this.photos.find((p) => p.id === id))
      .filter((p): p is Photo => Boolean(p));
    const busy = this._busy === problem.id;
    return html`<article class="problem">
      <header>
        <span class="title">${icon(mdiAlertCircleOutline)} ${problem.title}</span>
        <select
          aria-label=${t("problems.status")}
          @change=${(e: Event) =>
            this._run(problem.id, () =>
              updateProblem(this.hass, problem.id, {
                status: (e.target as HTMLSelectElement).value,
              }),
            )}
        >
          ${PROBLEM_STATUSES.map(
            (s) =>
              html`<option value=${s} ?selected=${s === problem.status}>
                ${t(`problem_status.${s}`)}
              </option>`,
          )}
        </select>
        <button
          class="icon-button small"
          aria-label=${t("common.delete")}
          title=${t("common.delete")}
          @click=${() => this._delete(problem)}
        >
          ${icon(mdiDeleteOutline)}
        </button>
      </header>
      <p class="muted small">
        ${t("problems.since", { date: formatDate(problem.observed_on, language) })}
      </p>
      ${
        photos.length
          ? html`<div class="thumbs">
              ${photos.map((p) => html`<img src=${p.urls.thumb} alt=${formatDate(p.taken_at, language)} />`)}
            </div>`
          : nothing
      }
      ${problem.diagnosis ? this._renderDiagnosis(problem.diagnosis) : nothing}
      ${
        this._status?.available
          ? html`<button
              class="button secondary"
              ?disabled=${busy || !photos.length}
              title=${photos.length ? "" : t("problems.needs_photo")}
              @click=${() => this._run(problem.id, () => diagnoseProblem(this.hass, problem.id))}
            >
              ${icon(mdiCreationOutline)}
              ${busy ? t("problems.diagnosing") : problem.diagnosis ? t("problems.diagnose_again") : t("problems.diagnose")}
            </button>`
          : nothing
      }
      ${this._renderLog(problem)}
    </article>`;
  }

  private _renderDiagnosis(d: Diagnosis) {
    const { t, language } = this;
    const list = (key: TranslationKey, items: string[]) =>
      items.length
        ? html`<h5>${t(key)}</h5>
            <ul>
              ${items.map((item) => html`<li>${item}</li>`)}
            </ul>`
        : nothing;
    return html`<section class="diagnosis">
      <p><strong>${d.summary}</strong></p>
      ${list("problems.symptoms", d.symptoms)}
      ${
        d.causes.length
          ? html`<h5>${t("problems.causes")}</h5>
              <ul class="causes">
                ${d.causes.map(
                  (c) =>
                    html`<li>
                      <span class="chip static">${t(`cause.${c.type}` as TranslationKey)}</span>
                      <strong>${c.name}</strong>
                      <span
                        class="bar"
                        role="meter"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow=${Math.round(c.confidence * 100)}
                        title=${`${Math.round(c.confidence * 100)} %`}
                        ><span style="width: ${Math.round(c.confidence * 100)}%"></span
                      ></span>
                      ${c.evidence ? html`<br /><span class="muted small">${c.evidence}</span>` : nothing}
                    </li>`,
                )}
              </ul>`
          : nothing
      }
      ${
        d.actions.length
          ? html`<h5>${t("problems.actions")}</h5>
              <ul class="actions">
                ${d.actions.map(
                  (a) =>
                    html`<li>
                      <span class="chip static urgency-${a.urgency}"
                        >${t(`urgency.${a.urgency}`)}</span
                      >
                      ${a.text}
                      ${
                        a.warning
                          ? html`<br /><span class="warning small"
                                >${icon(mdiAlertOutline)} ${a.warning}</span
                              >`
                          : nothing
                      }
                    </li>`,
                )}
              </ul>`
          : nothing
      }
      ${list("problems.monitoring", d.monitoring)} ${list("problems.missing", d.missing_info)}
      <p class="muted small">
        ${t("problems.diagnosed", {
          date: d.created ? formatDateTime(d.created, language) : "",
          model: d.model ?? "",
        })}
      </p>
    </section>`;
  }

  private _renderLog(problem: Problem) {
    const { t, language } = this;
    const log = this._details[problem.id] ?? [];
    const shown = log.filter((e) => e.kind !== "photo");
    return html`<section class="log">
      ${
        shown.length
          ? html`<ul>
              ${shown.map(
                (e) =>
                  html`<li class="small">
                    <span class="muted">${formatDateTime(e.ts, language)}</span>
                    ${t(`log.${e.kind}`)}${e.kind === "status" ? html`: ${t(`problem_status.${e.text}` as TranslationKey)}` : html`: ${e.text}`}
                  </li>`,
              )}
            </ul>`
          : nothing
      }
      <form
        class="add-log"
        @submit=${(e: Event) => {
          e.preventDefault();
          void this._log(problem, e.target as HTMLFormElement);
        }}
      >
        <select name="kind" aria-label=${t("problems.log_kind")}>
          <option value="action">${t("log.action")}</option>
          <option value="note">${t("log.note")}</option>
        </select>
        <input
          name="text"
          maxlength="2000"
          placeholder=${t("problems.log_placeholder")}
          aria-label=${t("problems.log_placeholder")}
        />
        <button class="button text" type="submit">${t("common.add")}</button>
      </form>
    </section>`;
  }

  private _renderReport() {
    const { t, language } = this;
    return html`<dialog class="report" aria-labelledby="report-title">
      <form @submit=${this._report}>
        <div class="dialog-header"><h2 id="report-title">${t("problems.report")}</h2></div>
        <div class="dialog-body form">
          <label class="field">
            <span>${t("problems.field_title")}</span>
            <input name="title" maxlength="200" placeholder=${t("problems.title_placeholder")} />
          </label>
          <label class="field">
            <span>${t("problems.field_note")}</span>
            <textarea name="note" rows="3" maxlength="2000"></textarea>
          </label>
          ${
            this.photos.length
              ? html`<div class="field">
                  <span>${t("problems.field_photos")}</span>
                  <div class="thumbs pick">
                    ${this.photos.map(
                      (p) =>
                        html`<button
                          type="button"
                          class="thumb ${this._chosen.has(p.id) ? "chosen" : ""}"
                          aria-pressed=${this._chosen.has(p.id) ? "true" : "false"}
                          @click=${() => {
                            const chosen = new Set(this._chosen);
                            if (chosen.has(p.id)) chosen.delete(p.id);
                            else chosen.add(p.id);
                            this._chosen = chosen;
                          }}
                        >
                          <img src=${p.urls.thumb} alt=${formatDate(p.taken_at, language)} />
                        </button>`,
                    )}
                  </div>
                </div>`
              : html`<p class="muted small">${t("problems.photo_hint")}</p>`
          }
        </div>
        <div class="dialog-actions">
          <button
            type="button"
            class="button text"
            @click=${() => this.renderRoot.querySelector<HTMLDialogElement>("dialog.report")?.close()}
          >
            ${t("common.cancel")}
          </button>
          <button type="submit" class="button" ?disabled=${this._busy === "report"}>
            ${t("problems.report")}
          </button>
        </div>
      </form>
    </dialog>`;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: block;
      }
      .block-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      h3 {
        margin: 0;
      }
      h5 {
        margin: 8px 0 2px;
        font-size: 13px;
      }
      .small {
        font-size: 13px;
      }
      .problem {
        border: 1px solid var(--pg-divider);
        border-radius: 12px;
        padding: 10px 12px;
        margin: 8px 0;
        display: grid;
        gap: 6px;
      }
      .problem header {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .problem .title {
        flex: 1;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--error-color, #db4437);
      }
      .problem header select {
        width: auto;
      }
      .problem p {
        margin: 0;
      }
      .thumbs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .thumbs img {
        width: 72px;
        height: 72px;
        object-fit: cover;
        border-radius: 8px;
        display: block;
      }
      .thumb {
        padding: 0;
        border: 2px solid transparent;
        border-radius: 10px;
        background: none;
        cursor: pointer;
      }
      .thumb.chosen {
        border-color: var(--pg-accent);
      }
      .diagnosis ul,
      .log ul {
        margin: 0;
        padding-left: 18px;
      }
      .diagnosis li {
        margin: 2px 0;
      }
      .causes,
      .actions {
        list-style: none;
        padding-left: 0 !important;
      }
      .bar {
        display: inline-block;
        width: 50px;
        height: 6px;
        border-radius: 3px;
        background: color-mix(in srgb, var(--pg-text) 12%, transparent);
        overflow: hidden;
        vertical-align: middle;
        margin-left: 6px;
      }
      .bar span {
        display: block;
        height: 100%;
        background: var(--pg-accent);
      }
      .urgency-now {
        background: color-mix(in srgb, var(--error-color, #db4437) 18%, transparent);
      }
      .warning {
        color: var(--warning-color, #b26a00);
      }
      .warning .icon {
        width: 14px;
        height: 14px;
        vertical-align: -2px;
      }
      .add-log {
        display: flex;
        gap: 6px;
        margin-top: 6px;
      }
      .add-log select {
        width: auto;
      }
      .small-button {
        min-height: 0;
        padding: 0 6px;
      }
      dialog {
        width: min(520px, calc(100vw - 24px));
      }
      .form {
        display: grid;
        gap: 12px;
      }
    `,
  ];
}

define("pg-problems-panel", PgProblemsPanel);
