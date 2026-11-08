import {
  mdiAlertCircleOutline,
  mdiCheckboxBlankCircleOutline,
  mdiCheckCircle,
  mdiCreationOutline,
  mdiDeleteOutline,
  mdiPencilOutline,
  mdiPlus,
  mdiRepeat,
} from "@mdi/js";
import { css, html, nothing } from "lit";

import {
  completeTask,
  createTask,
  deleteTask,
  errorMessage,
  listTasks,
  reopenTask,
  updateTask,
} from "../api/client";
import {
  TASK_KINDS,
  type GardenChangeEvent,
  type Repeat,
  type Task,
  type TaskFields,
  type TaskKind,
} from "../api/types";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { formatDate, parseLocalDate, todayIso } from "../util/format";
import { PgElement, define, icon } from "./base";
import type { PgConfirmDialog } from "./confirm-dialog";
import "./confirm-dialog";

export type TaskGroup = "overdue" | "today" | "week" | "later" | "undated" | "done";

/** Which group a task belongs to on a given day. */
export function taskGroup(task: Task, today: string): TaskGroup {
  if (task.status === "done") return "done";
  if (!task.due) return "undated";
  if (task.due < today) return "overdue";
  if (task.due === today) return "today";
  const week = parseLocalDate(today);
  week.setDate(week.getDate() + 7);
  return parseLocalDate(task.due) <= week ? "week" : "later";
}

const GROUPS: TaskGroup[] = ["overdue", "today", "week", "later", "undated", "done"];

/**
 * Tasks of one plant or the whole garden: tick off, edit, delete, add. A
 * repeating task comes back with its next date when it is done.
 */
export class PgTaskList extends PgElement {
  static override properties = {
    store: { attribute: false },
    plantId: { attribute: false },
    prefix: { attribute: false },
    _tasks: { state: true },
    _editing: { state: true },
    _error: { state: true },
  };

  declare store: GardenStore;
  /** Only this plant's tasks (and new tasks belong to it); null = the whole garden. */
  declare plantId: string | null;
  declare prefix: string;
  declare _tasks: Task[] | null;
  declare _editing: Task | "new" | null;
  declare _error: string;

  private readonly _onChange = (event: Event) => {
    const change = (event as CustomEvent<GardenChangeEvent>).detail;
    if (change.kind === "care" || change.kind === "plant_removed") void this._load();
  };

  constructor() {
    super();
    this.plantId = null;
    this.prefix = "/plant-garden";
    this._tasks = null;
    this._editing = null;
    this._error = "";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.store?.addEventListener("plant-changed", this._onChange);
    void this._load();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.store?.removeEventListener("plant-changed", this._onChange);
  }

  private async _load(): Promise<void> {
    try {
      this._tasks = await listTasks(this.hass, this.plantId ?? undefined);
      this._error = "";
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private async _run(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
      await this._load();
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private _toggle(task: Task): void {
    void this._run(() =>
      task.status === "done" ? reopenTask(this.hass, task.id) : completeTask(this.hass, task.id),
    );
  }

  private async _delete(task: Task): Promise<void> {
    const confirm = this.renderRoot.querySelector<PgConfirmDialog>("pg-confirm-dialog");
    const ok = await confirm?.ask(
      this.t("tasks.delete_title"),
      this.t("tasks.delete_body", { title: task.title }),
      this.t("common.delete"),
    );
    if (ok) await this._run(() => deleteTask(this.hass, task.id));
  }

  private _open(task: Task | "new"): void {
    this._editing = task;
    void this.updateComplete.then(() => this.renderRoot.querySelector("dialog")?.showModal());
  }

  private _close(): void {
    this.renderRoot.querySelector("dialog")?.close();
    this._editing = null;
  }

  private async _save(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const data = new FormData(form);
    const every = Number(data.get("every") || 0);
    const repeat: Repeat | null =
      every > 0 ? { every, unit: (data.get("unit") as Repeat["unit"]) || "days" } : null;
    const fields: TaskFields & { title: string } = {
      kind: data.get("kind") as TaskKind,
      title: String(data.get("title") ?? "").trim(),
      notes: String(data.get("notes") ?? ""),
      due: String(data.get("due") ?? "") || null,
      repeat,
      months: data.getAll("months").map(Number),
      plant_id: this.plantId ?? (String(data.get("plant") ?? "") || null),
    };
    const editing = this._editing;
    await this._run(() =>
      editing && editing !== "new"
        ? updateTask(this.hass, editing.id, fields)
        : createTask(this.hass, fields),
    );
    if (!this._error) this._close();
  }

  private _due(task: Task) {
    const { t, language } = this;
    if (!task.due) return nothing;
    return html`<span class=${taskGroup(task, todayIso()) === "overdue" ? "overdue" : ""}>
      ${t("tasks.due", { date: formatDate(task.due, language) })}</span
    >`;
  }

  protected override render() {
    const { t } = this;
    const tasks = this._tasks ?? [];
    const today = todayIso();
    const groups = GROUPS.map((group) => ({
      group,
      tasks: tasks.filter((task) => taskGroup(task, today) === group),
    })).filter((g) => g.tasks.length);
    return html`
      <div class="block-header">
        <h3>${t("tasks.title")}</h3>
        <button class="button text" @click=${() => this._open("new")}>
          ${icon(mdiPlus)} ${t("tasks.add")}
        </button>
      </div>
      ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
      ${
        this._tasks && !tasks.length
          ? html`<p class="muted small">${t("tasks.none")}</p>`
          : groups.map(
              ({ group, tasks: items }) =>
                html`<h4 class="group ${group}">${t(`tasks.group_${group}`)}</h4>
                  <ul>
                    ${items.map((task) => this._renderTask(task))}
                  </ul>`,
            )
      }
      ${this._editing ? this._renderDialog(this._editing) : nothing}
      <pg-confirm-dialog .hass=${this.hass}></pg-confirm-dialog>
    `;
  }

  private _renderTask(task: Task) {
    const { t } = this;
    const plant = !this.plantId && task.plant_id ? this.store?.getPlant(task.plant_id) : undefined;
    const done = task.status === "done";
    return html`<li class=${done ? "done" : ""}>
      <button
        class="icon-button check"
        role="checkbox"
        aria-checked=${done ? "true" : "false"}
        aria-label=${done ? t("tasks.reopen") : t("tasks.complete")}
        title=${done ? t("tasks.reopen") : t("tasks.complete")}
        @click=${() => this._toggle(task)}
      >
        ${icon(done ? mdiCheckCircle : mdiCheckboxBlankCircleOutline)}
      </button>
      <div class="task-text">
        <span class="title">${task.title}</span>
        <span class="muted small meta">
          ${t(`task_kind.${task.kind}`)}
          ${plant ? html`· <a href=${`${this.prefix}/plants/${plant.id}`}>${plant.name}</a>` : nothing}
          ${task.due ? html`· ${this._due(task)}` : nothing}
          ${
            task.repeat
              ? html`· ${icon(mdiRepeat)}
                ${t(`tasks.every_${task.repeat.unit}`, { n: task.repeat.every })}`
              : nothing
          }
          ${task.source === "ai" ? html`· ${icon(mdiCreationOutline)} ${t("tasks.from_ai")}` : nothing}
          ${task.problem_id ? html`· ${icon(mdiAlertCircleOutline)}` : nothing}
        </span>
        ${task.notes ? html`<span class="small notes">${task.notes}</span>` : nothing}
      </div>
      <button
        class="icon-button small"
        aria-label=${t("common.edit")}
        title=${t("common.edit")}
        @click=${() => this._open(task)}
      >
        ${icon(mdiPencilOutline)}
      </button>
      <button
        class="icon-button small"
        aria-label=${t("common.delete")}
        title=${t("common.delete")}
        @click=${() => this._delete(task)}
      >
        ${icon(mdiDeleteOutline)}
      </button>
    </li>`;
  }

  private _renderDialog(task: Task | "new") {
    const { t, language } = this;
    const value = task === "new" ? null : task;
    const months = new Set(value?.months ?? []);
    return html`<dialog aria-labelledby="task-title" @close=${() => (this._editing = null)}>
      <form @submit=${this._save}>
        <div class="dialog-header">
          <h2 id="task-title">${value ? t("tasks.edit") : t("tasks.add")}</h2>
        </div>
        <div class="dialog-body form">
          <label class="field">
            <span>${t("tasks.field_title")}</span>
            <input name="title" required maxlength="200" .value=${value?.title ?? ""} />
          </label>
          <label class="field">
            <span>${t("tasks.field_kind")}</span>
            <select name="kind">
              ${TASK_KINDS.map(
                (kind) =>
                  html`<option value=${kind} ?selected=${(value?.kind ?? "other") === kind}>
                    ${t(`task_kind.${kind}`)}
                  </option>`,
              )}
            </select>
          </label>
          ${
            this.plantId
              ? nothing
              : html`<label class="field">
                  <span>${t("tasks.field_plant")}</span>
                  <select name="plant">
                    <option value="">${t("tasks.no_plant")}</option>
                    ${(this.store?.plants ?? []).map(
                      (plant) =>
                        html`<option value=${plant.id} ?selected=${value?.plant_id === plant.id}>
                          ${plant.name}
                        </option>`,
                    )}
                  </select>
                </label>`
          }
          <label class="field">
            <span>${t("tasks.field_due")}</span>
            <input type="date" name="due" .value=${value?.due ?? ""} />
          </label>
          <div class="field repeat">
            <span>${t("tasks.field_repeat")}</span>
            <div>
              <input
                type="number"
                name="every"
                min="0"
                max="365"
                aria-label=${t("tasks.field_every")}
                .value=${String(value?.repeat?.every ?? "")}
                placeholder="–"
              />
              <select name="unit" aria-label=${t("tasks.field_unit")}>
                <option value="days" ?selected=${value?.repeat?.unit !== "weeks"}>
                  ${t("tasks.unit_days")}
                </option>
                <option value="weeks" ?selected=${value?.repeat?.unit === "weeks"}>
                  ${t("tasks.unit_weeks")}
                </option>
              </select>
            </div>
            <small>${t("tasks.repeat_hint")}</small>
          </div>
          <fieldset class="months">
            <legend>${t("tasks.field_months")}</legend>
            ${Array.from({ length: 12 }, (_, i) => i + 1).map(
              (month) =>
                html`<label class="month">
                  <input
                    type="checkbox"
                    name="months"
                    value=${month}
                    ?checked=${months.has(month)}
                  />
                  ${new Date(2026, month - 1, 1).toLocaleString(language, { month: "short" })}
                </label>`,
            )}
          </fieldset>
          <label class="field">
            <span>${t("tasks.field_notes")}</span>
            <textarea name="notes" rows="2" .value=${value?.notes ?? ""}></textarea>
          </label>
          ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
        </div>
        <div class="dialog-actions">
          <button type="button" class="button text" @click=${this._close}>
            ${t("common.cancel")}
          </button>
          <button type="submit" class="button">${t("common.save")}</button>
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
      h4 {
        margin: 12px 0 4px;
        font-size: 13px;
        font-weight: 500;
        color: var(--pg-text-muted);
      }
      h4.overdue {
        color: var(--error-color, #db4437);
      }
      ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 2px;
      }
      li {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 4px 0;
        border-bottom: 1px solid var(--pg-divider);
      }
      li.done .title {
        text-decoration: line-through;
        color: var(--pg-text-muted);
      }
      .check {
        color: var(--pg-accent);
      }
      .task-text {
        flex: 1;
        display: grid;
        min-width: 0;
        padding-top: 6px;
      }
      .meta .icon {
        width: 14px;
        height: 14px;
        vertical-align: -2px;
      }
      .overdue {
        color: var(--error-color, #db4437);
      }
      .small {
        font-size: 13px;
      }
      .notes {
        white-space: pre-line;
      }
      a {
        color: inherit;
      }
      dialog {
        width: min(520px, calc(100vw - 24px));
      }
      .form {
        display: grid;
        gap: 12px;
      }
      .repeat div {
        display: flex;
        gap: 8px;
      }
      .repeat input {
        width: 90px;
      }
      .months {
        border: 1px solid var(--pg-divider);
        border-radius: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 4px 10px;
        padding: 6px 10px 10px;
        margin: 0;
      }
      .months legend {
        font-size: 12px;
        color: var(--pg-text-muted);
      }
      .month {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 13px;
      }
      .month input {
        width: auto;
        min-height: 0;
      }
    `,
  ];
}

define("pg-task-list", PgTaskList);
