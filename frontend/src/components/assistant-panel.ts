import {
  mdiCheck,
  mdiClose,
  mdiCreationOutline,
  mdiDeleteSweepOutline,
  mdiOpenInNew,
  mdiSend,
} from "@mdi/js";
import { css, html, nothing } from "lit";

import {
  aiStatus,
  answerQuestion,
  askAssistant,
  chatHistory,
  clearChat,
  createTips,
  decideTip,
  errorMessage,
  getTips,
  listQuestions,
} from "../api/client";
import type {
  AIStatus,
  ChatMessage,
  GardenChangeEvent,
  Question,
  Tip,
  TipsRecord,
} from "../api/types";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { formatDateTime } from "../util/format";
import { renderMarkdown } from "../util/markdown";
import { PgElement, define, icon } from "./base";

/**
 * The assistant for one plant or the whole garden (spec 4.7): questions of
 * the AI to the user, tips whose jobs can become tasks, and a chat whose
 * answers appear while they are written.
 */
export class PgAssistantPanel extends PgElement {
  static override properties = {
    store: { attribute: false },
    plantId: { attribute: false },
    prefix: { attribute: false },
    _status: { state: true },
    _questions: { state: true },
    _tips: { state: true },
    _messages: { state: true },
    _pending: { state: true },
    _streaming: { state: true },
    _busy: { state: true },
    _error: { state: true },
  };

  declare store: GardenStore;
  declare plantId: string | null;
  declare prefix: string;
  declare _status: AIStatus | null;
  declare _questions: Question[];
  declare _tips: TipsRecord | null;
  declare _messages: ChatMessage[];
  /** The question being answered and the answer so far. */
  declare _pending: string | null;
  declare _streaming: string;
  declare _busy: string;
  declare _error: string;

  private readonly _onChange = (event: Event) => {
    const change = (event as CustomEvent<GardenChangeEvent>).detail;
    if (change.kind !== "care" || this._pending !== null) return;
    if (!this.plantId || !change.plant_id || change.plant_id === this.plantId) void this._load();
  };

  constructor() {
    super();
    this.plantId = null;
    this.prefix = "/plant-garden";
    this._status = null;
    this._questions = [];
    this._tips = null;
    this._messages = [];
    this._pending = null;
    this._streaming = "";
    this._busy = "";
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
      const [status, questions, tips, messages] = await Promise.all([
        aiStatus(this.hass),
        listQuestions(this.hass, this.plantId ?? undefined),
        getTips(this.hass, this.plantId),
        chatHistory(this.hass, this.plantId),
      ]);
      this._status = status;
      // in the garden view: every open question; for a plant: only its own
      this._questions = questions;
      this._tips = tips;
      this._messages = messages;
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private async _run(key: string, action: () => Promise<void>): Promise<void> {
    this._busy = key;
    this._error = "";
    try {
      await action();
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = "";
    }
  }

  private _tipsNow(): Promise<void> {
    return this._run("tips", async () => {
      this._tips = await createTips(this.hass, this.plantId);
      this._questions = await listQuestions(this.hass, this.plantId ?? undefined);
    });
  }

  private _decide(tip: Tip, accept: boolean): Promise<void> {
    return this._run(tip.id, async () => {
      this._tips = await decideTip(this.hass, this.plantId, tip.id, accept);
    });
  }

  private _answer(
    question: Question,
    form: HTMLFormElement | null,
    dismiss = false,
  ): Promise<void> {
    const answer = form ? String(new FormData(form).get("answer") ?? "").trim() : "";
    if (!dismiss && !answer) return Promise.resolve();
    return this._run(question.id, async () => {
      await answerQuestion(this.hass, question.id, dismiss ? { dismiss: true } : { answer });
      this._questions = this._questions.filter((q) => q.id !== question.id);
    });
  }

  private async _send(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const field = form.querySelector("textarea");
    const text = (field?.value ?? "").trim();
    if (!text || this._pending !== null) return;
    this._pending = text;
    this._streaming = "";
    this._error = "";
    if (field) field.value = "";
    try {
      const answer = await askAssistant(this.hass, this.plantId, text, (delta) => {
        this._streaming += delta;
      });
      const now = new Date().toISOString();
      this._messages = [
        ...this._messages,
        { id: `local-${now}`, plant_id: this.plantId, role: "user", text, ts: now, model: null },
        answer,
      ];
    } catch (err) {
      this._error = errorMessage(err);
      if (field && !field.value) field.value = text;
    } finally {
      this._pending = null;
      this._streaming = "";
    }
    void this._load();
  }

  private _keydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      (event.target as HTMLTextAreaElement).form?.requestSubmit();
    }
  }

  protected override render() {
    const { t } = this;
    if (!this._status) return nothing;
    if (!this._status.available) {
      return html`<div class="block-header">
          <h3>${t("assistant.title")}</h3>
          <a class="button text" href="/config/integrations/integration/plant_garden">
            ${icon(mdiOpenInNew)} ${t("ai.setup_link")}
          </a>
        </div>
        <p class="muted small">${t("assistant.setup")}</p>`;
    }
    return html`
      ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
      ${this._renderQuestions()} ${this._renderTips()} ${this._renderChat()}
    `;
  }

  private _renderQuestions() {
    const { t } = this;
    if (!this._questions.length) return nothing;
    return html`<section class="questions">
      <h3>${t("assistant.questions")}</h3>
      ${this._questions.map(
        (q) =>
          html`<form
            class="question"
            @submit=${(e: Event) => {
              e.preventDefault();
              void this._answer(q, e.target as HTMLFormElement);
            }}
          >
            <p>
              ${q.question}
              ${
                !this.plantId && q.plant_id
                  ? html`<a class="muted small" href=${`${this.prefix}/plants/${q.plant_id}`}>
                      ${this.store?.getPlant(q.plant_id)?.name ?? ""}</a
                    >`
                  : nothing
              }
            </p>
            <div class="row">
              <input
                name="answer"
                maxlength="2000"
                aria-label=${t("assistant.answer")}
                placeholder=${t("assistant.answer")}
              />
              <button class="button text" type="submit" ?disabled=${this._busy === q.id}>
                ${t("assistant.reply")}
              </button>
              <button
                class="icon-button small"
                type="button"
                aria-label=${t("assistant.dismiss")}
                title=${t("assistant.dismiss")}
                @click=${() => this._answer(q, null, true)}
              >
                ${icon(mdiClose)}
              </button>
            </div>
          </form>`,
      )}
    </section>`;
  }

  private _renderTips() {
    const { t, language } = this;
    const record = this._tips;
    return html`<section class="tips">
      <div class="block-header">
        <h3>${t("assistant.tips")}</h3>
        <button class="button text" ?disabled=${this._busy === "tips"} @click=${this._tipsNow}>
          ${icon(mdiCreationOutline)}
          ${this._busy === "tips" ? t("assistant.thinking") : record ? t("assistant.tips_again") : t("assistant.tips_get")}
        </button>
      </div>
      ${
        record
          ? html`<p class="muted small">
                ${t(record.weekly ? "assistant.tips_weekly" : "assistant.tips_from", {
                  date: formatDateTime(record.created, language),
                  model: record.model,
                })}
              </p>
              <ul>
                ${record.tips.map((tip) => this._renderTip(tip))}
              </ul>`
          : html`<p class="muted small">${t("assistant.tips_hint")}</p>`
      }
    </section>`;
  }

  private _renderTip(tip: Tip) {
    const { t } = this;
    const plant = !this.plantId && tip.plant_id ? this.store?.getPlant(tip.plant_id) : undefined;
    return html`<li>
      <strong>${tip.title}</strong>
      ${plant ? html`<a class="muted small" href=${`${this.prefix}/plants/${plant.id}`}>${plant.name}</a>` : nothing}
      <div class="markdown">${renderMarkdown(tip.text)}</div>
      ${
        tip.task
          ? html`<div class="proposal small">
              <span>
                ${t("assistant.task_proposal", { title: tip.task.title })}
                ${
                  tip.task.due_in_days !== null
                    ? t("assistant.task_due", { n: tip.task.due_in_days })
                    : ""
                }
              </span>
              ${
                tip.state === "new"
                  ? html`<button
                        class="button text"
                        ?disabled=${this._busy === tip.id}
                        @click=${() => this._decide(tip, true)}
                      >
                        ${icon(mdiCheck)} ${t("assistant.take_over")}
                      </button>
                      <button
                        class="icon-button small"
                        aria-label=${t("ai.reject")}
                        title=${t("ai.reject")}
                        @click=${() => this._decide(tip, false)}
                      >
                        ${icon(mdiClose)}
                      </button>`
                  : html`<span class="muted"
                      >${t(tip.state === "accepted" ? "assistant.taken_over" : "ai.state_rejected")}</span
                    >`
              }
            </div>`
          : nothing
      }
    </li>`;
  }

  private _renderChat() {
    const { t } = this;
    return html`<section class="chat">
      <div class="block-header">
        <h3>${this.plantId ? t("assistant.ask_plant") : t("assistant.chat")}</h3>
        ${
          this._messages.length
            ? html`<button
                class="icon-button small"
                aria-label=${t("assistant.clear")}
                title=${t("assistant.clear")}
                @click=${() =>
                  this._run("clear", async () => {
                    await clearChat(this.hass, this.plantId);
                    this._messages = [];
                  })}
              >
                ${icon(mdiDeleteSweepOutline)}
              </button>`
            : nothing
        }
      </div>
      <div class="messages" aria-live="polite">
        ${this._messages.map((m) => this._renderMessage(m.role, m.text))}
        ${
          this._pending !== null
            ? html`${this._renderMessage("user", this._pending)}
              ${this._renderMessage("assistant", this._streaming || "…")}`
            : nothing
        }
      </div>
      <form class="ask" @submit=${this._send}>
        <textarea
          rows="2"
          maxlength="4000"
          aria-label=${t("assistant.placeholder")}
          placeholder=${t("assistant.placeholder")}
          @keydown=${this._keydown}
        ></textarea>
        <button
          class="icon-button"
          type="submit"
          aria-label=${t("assistant.send")}
          title=${t("assistant.send")}
          ?disabled=${this._pending !== null}
        >
          ${icon(mdiSend)}
        </button>
      </form>
      <p class="muted small">${t("assistant.cost_hint")}</p>
    </section>`;
  }

  private _renderMessage(role: string, text: string) {
    return html`<div class="message ${role}">
      ${role === "assistant" ? html`<div class="markdown">${renderMarkdown(text)}</div>` : text}
    </div>`;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: grid;
        gap: 16px;
      }
      .block-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      h3 {
        margin: 0;
      }
      .small {
        font-size: 13px;
      }
      section > p {
        margin: 4px 0;
      }
      ul {
        list-style: none;
        padding: 0;
        margin: 8px 0 0;
        display: grid;
        gap: 10px;
      }
      .tips li {
        border-left: 3px solid var(--pg-accent);
        padding-left: 10px;
      }
      .markdown :first-child {
        margin-top: 2px;
      }
      .markdown :last-child {
        margin-bottom: 0;
      }
      .markdown p,
      .markdown ul,
      .markdown ol {
        margin: 4px 0;
      }
      .markdown ul,
      .markdown ol {
        padding-left: 18px;
        display: block;
        list-style: revert;
      }
      .markdown h4 {
        margin: 8px 0 2px;
      }
      .proposal {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 8px;
        margin-top: 4px;
      }
      .question {
        border: 1px solid var(--pg-divider);
        border-radius: 10px;
        padding: 8px 10px;
        margin-top: 8px;
      }
      .question p {
        margin: 0 0 6px;
      }
      .row {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .messages {
        display: grid;
        gap: 8px;
        margin: 8px 0;
        max-height: 480px;
        overflow-y: auto;
      }
      .message {
        max-width: 85%;
        padding: 8px 12px;
        border-radius: 14px;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .message.user {
        justify-self: end;
        background: color-mix(in srgb, var(--pg-accent) 16%, transparent);
      }
      .message.assistant {
        justify-self: start;
        background: color-mix(in srgb, var(--pg-text) 6%, transparent);
        white-space: normal;
      }
      .ask {
        display: flex;
        gap: 6px;
        align-items: flex-end;
      }
      .ask textarea {
        flex: 1;
        resize: vertical;
      }
      a {
        color: inherit;
      }
      a.button {
        text-decoration: none;
      }
    `,
  ];
}

define("pg-assistant-panel", PgAssistantPanel);
