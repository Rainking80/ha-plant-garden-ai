import {
  mdiArrowCollapseHorizontal,
  mdiArrowExpandHorizontal,
  mdiCheck,
  mdiClose,
  mdiDeleteOutline,
  mdiHistory,
  mdiPlus,
  mdiRobotHappyOutline,
  mdiSendOutline,
  mdiUndoVariant,
} from "@mdi/js";
import { css, html, nothing, type PropertyValues } from "lit";

import {
  agentChat,
  agentState,
  askAgent,
  deleteAgentChat,
  errorMessage,
  undoAgentAction,
} from "../api/client";
import type { AgentAction, AgentChat, AgentMessage, AgentState } from "../api/types";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { formatDate, formatMoney } from "../util/format";
import { renderMarkdown } from "../util/markdown";
import { PgElement, define, icon } from "./base";
import "./confirm-dialog";
import type { PgConfirmDialog } from "./confirm-dialog";

const WIDE_KEY = "plant-garden.agent-wide.v1";
const STEPS = [
  "garden_overview",
  "list_plants",
  "plant_info",
  "weather",
  "list_tasks",
  "create_plant",
  "update_plant",
  "log_watering",
  "create_task",
  "complete_task",
  "report_problem",
  "help",
  "web_search",
] as const;

/** What the agent is doing, for a tool it uses; a tool this panel does not know is "thinking". */
function stepKey(tool: string | undefined) {
  const known = STEPS.find((step) => step === tool);
  return known ? (`agent.step.${known}` as const) : "agent.thinking";
}

const QUESTIONS = ["agent.ask_today", "agent.ask_water", "agent.ask_setup"] as const;

/**
 * The garden assistant: a button in the panel's header (which stays on screen
 * while scrolling) that opens a chat beside the page - half the window wide, or
 * 90 % when enlarged. The agent behind it knows the garden, explains the
 * software, searches the web and does small things on request; whatever it
 * changed is listed under its answer with "undo".
 *
 * Conversations are saved with a title the AI gives them. The list shows them
 * by title and date, to go on with one or to delete it.
 */
export class PgAgentChat extends PgElement {
  static override properties = {
    store: { attribute: false },
    /** where the user is, so "this plant" means the open one */
    view: {},
    plantId: { attribute: false },
    _open: { state: true },
    _wide: { state: true },
    _state: { state: true },
    _chats: { state: true },
    _chatId: { state: true },
    _listing: { state: true },
    _messages: { state: true },
    _steps: { state: true },
    _pending: { state: true },
    _asked: { state: true },
    _busy: { state: true },
    _input: { state: true },
    _error: { state: true },
  };

  declare store: GardenStore | undefined;
  declare view: string;
  declare plantId: string | null;
  declare _open: boolean;
  declare _wide: boolean;
  declare _state: AgentState | null;
  /** the saved conversations, the one used last first */
  declare _chats: AgentChat[];
  /** the conversation shown; null: a new one that starts with the next question */
  declare _chatId: string | null;
  /** the list of conversations is shown instead of the chat */
  declare _listing: boolean;
  declare _messages: AgentMessage[];
  /** tools the agent is using for the running question */
  declare _steps: string[];
  /** what it changed so far, while the answer is still on its way */
  declare _pending: AgentAction[];
  /** the question being answered */
  declare _asked: string;
  declare _busy: boolean;
  declare _input: string;
  declare _error: string;

  constructor() {
    super();
    this.view = "";
    this.plantId = null;
    this._open = false;
    this._state = null;
    this._chats = [];
    this._chatId = null;
    this._listing = false;
    this._messages = [];
    this._steps = [];
    this._pending = [];
    this._asked = "";
    this._busy = false;
    this._input = "";
    this._error = "";
    try {
      this._wide = localStorage.getItem(WIDE_KEY) === "true";
    } catch {
      this._wide = false;
    }
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has("_messages") || changed.has("_steps") || changed.has("_open")) {
      const log = this.renderRoot.querySelector(".log");
      if (log) log.scrollTop = log.scrollHeight;
    }
  }

  private async _toggle(): Promise<void> {
    this._open = !this._open;
    if (!this._open) return;
    try {
      const state = await agentState(this.hass);
      this._state = state;
      this._chats = state.chats;
      this._error = "";
    } catch (err) {
      this._error = errorMessage(err);
    }
    await this.updateComplete;
    this.renderRoot.querySelector("textarea")?.focus();
  }

  private _setWide(wide: boolean): void {
    this._wide = wide;
    try {
      localStorage.setItem(WIDE_KEY, String(wide));
    } catch {
      // private mode: the size is forgotten
    }
  }

  // ------------------------------------------------------------ conversations
  private _newChat(): void {
    if (this._busy) return;
    this._chatId = null;
    this._messages = [];
    this._listing = false;
    this._error = "";
    void this.updateComplete.then(() => this.renderRoot.querySelector("textarea")?.focus());
  }

  /** Open a saved conversation to go on with it. */
  private async _openChat(chat: AgentChat): Promise<void> {
    if (this._busy) return;
    try {
      const saved = await agentChat(this.hass, chat.id);
      this._chatId = saved.id;
      this._messages = saved.messages;
      this._listing = false;
      this._error = "";
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private async _deleteChat(chat: AgentChat): Promise<void> {
    const confirm = this.renderRoot.querySelector<PgConfirmDialog>("pg-confirm-dialog");
    const ok = await confirm?.ask(
      this.t("agent.delete_title"),
      this.t("agent.delete_text", { title: chat.title || this.t("agent.untitled") }),
      this.t("common.delete"),
    );
    if (!ok) return;
    try {
      await deleteAgentChat(this.hass, chat.id);
      this._chats = this._chats.filter((other) => other.id !== chat.id);
      if (this._chatId === chat.id) {
        this._chatId = null;
        this._messages = [];
      }
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private get _title(): string {
    const chat = this._chats.find((other) => other.id === this._chatId);
    return chat?.title || this.t("agent.title");
  }

  // ------------------------------------------------------------ asking
  private async _ask(text: string): Promise<void> {
    const question = text.trim();
    if (!question || this._busy) return;
    this._busy = true;
    this._error = "";
    this._input = "";
    this._asked = question;
    this._steps = [];
    this._pending = [];
    try {
      const { message, chat } = await askAgent(
        this.hass,
        question,
        { chatId: this._chatId, view: this.view, plantId: this.plantId },
        (event) => {
          if ("step" in event) this._steps = [...this._steps, event.step];
          else if ("action" in event) this._pending = [...this._pending, event.action];
        },
      );
      const asked: AgentMessage = {
        id: `q-${message.id}`,
        role: "user",
        text: question,
        created: message.created,
      };
      this._messages = [...this._messages, asked, message];
      // the conversation is saved now (a new one got its title) and moves to the top
      this._chatId = chat.id;
      this._chats = [chat, ...this._chats.filter((other) => other.id !== chat.id)];
      // plants, tasks or waterings may have changed
      if (message.actions?.length) void this.store?.refresh();
    } catch (err) {
      this._error = errorMessage(err);
      this._input = question;
      if (this._pending.length) void this.store?.refresh();
    } finally {
      this._busy = false;
      this._asked = "";
      this._steps = [];
      this._pending = [];
    }
  }

  private async _undo(action: AgentAction): Promise<void> {
    try {
      const message = await undoAgentAction(this.hass, action.id);
      this._messages = this._messages.map((m) => (m.id === message.id ? message : m));
      void this.store?.refresh();
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private _onKey(event: KeyboardEvent): void {
    // Enter sends, Shift+Enter makes a new line
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void this._ask(this._input);
    }
  }

  // ------------------------------------------------------------ rendering
  private _renderAction(action: AgentAction, undoable: boolean) {
    const { t } = this;
    return html`<li class="action ${action.undone ? "undone" : ""}">
      ${icon(action.undone ? mdiUndoVariant : mdiCheck)}
      <span>${t(`agent.action.${action.kind}`, { label: action.label })}</span>
      ${
        action.undone
          ? html`<span class="muted small">${t("agent.undone")}</span>`
          : undoable
            ? html`<button class="button text undo" @click=${() => this._undo(action)}>
                ${t("agent.undo")}
              </button>`
            : nothing
      }
    </li>`;
  }

  private _renderMessage(message: AgentMessage) {
    const { t, language } = this;
    if (message.role === "user") {
      return html`<div class="message user"><p>${message.text}</p></div>`;
    }
    const cost =
      message.cost !== null && message.cost !== undefined
        ? formatMoney(message.cost, this._state?.currency ?? "EUR", language)
        : "";
    return html`<div class="message assistant">
      <div class="text">${renderMarkdown(message.text)}</div>
      ${
        message.actions?.length
          ? html`<ul class="actions">
              ${message.actions.map((action) => this._renderAction(action, true))}
            </ul>`
          : nothing
      }
      ${
        message.sources?.length
          ? html`<p class="sources small">
              ${t("agent.sources")}
              ${message.sources.map(
                (source) =>
                  html`<a href=${source.url} target="_blank" rel="noopener noreferrer"
                    >${source.title}</a
                  >`,
              )}
            </p>`
          : nothing
      }
      ${cost ? html`<p class="muted small cost">${cost}</p>` : nothing}
    </div>`;
  }

  private _renderRunning() {
    const { t } = this;
    return html`<div class="message user"><p>${this._asked}</p></div>
      <div class="message assistant running" aria-live="polite">
        <p class="muted">
          <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
          ${t(stepKey(this._steps.at(-1)))}
        </p>
        ${
          this._pending.length
            ? html`<ul class="actions">
                ${this._pending.map((action) => this._renderAction(action, false))}
              </ul>`
            : nothing
        }
      </div>`;
  }

  /** The saved conversations: title and date, to go on with one or to delete it. */
  private _renderList() {
    const { t, language } = this;
    return html`<div class="log list">
      <button class="button secondary new" @click=${() => this._newChat()}>
        ${icon(mdiPlus)} ${t("agent.new")}
      </button>
      ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
      ${
        this._chats.length
          ? html`<ul class="chats">
              ${this._chats.map(
                (chat) =>
                  html`<li class=${chat.id === this._chatId ? "current" : ""}>
                    <button class="chat" @click=${() => this._openChat(chat)}>
                      <strong>${chat.title || t("agent.untitled")}</strong>
                      <span class="muted small">
                        ${formatDate(chat.updated, language)} ·
                        ${t("agent.count", { count: chat.messages })}
                      </span>
                    </button>
                    <button
                      class="icon-button small delete"
                      aria-label=${t("agent.delete_title")}
                      title=${t("agent.delete_title")}
                      @click=${() => this._deleteChat(chat)}
                    >
                      ${icon(mdiDeleteOutline)}
                    </button>
                  </li>`,
              )}
            </ul>`
          : html`<p class="empty muted">${t("agent.no_chats")}</p>`
      }
    </div>`;
  }

  private _renderBody() {
    const { t } = this;
    const state = this._state;
    if (state && !state.available) {
      return html`<div class="log"><p class="empty">${t("agent.no_provider")}</p></div>`;
    }
    if (this._listing) return this._renderList();
    const empty = !this._messages.length && !this._busy;
    return html`<div class="log">
        ${
          empty
            ? html`<div class="empty">
                <p>${t("agent.welcome")}</p>
                <div class="chips">
                  ${QUESTIONS.map(
                    (key) =>
                      html`<button class="chip" @click=${() => this._ask(t(key))}>
                        ${t(key)}
                      </button>`,
                  )}
                </div>
                <p class="muted small">${t(state?.web ? "agent.hint_web" : "agent.hint_no_web")}</p>
              </div>`
            : nothing
        }
        ${this._messages.map((message) => this._renderMessage(message))}
        ${this._busy ? this._renderRunning() : nothing}
        ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
      </div>
      <form
        class="ask"
        @submit=${(e: Event) => {
          e.preventDefault();
          void this._ask(this._input);
        }}
      >
        <textarea
          rows="2"
          maxlength="4000"
          placeholder=${t("agent.placeholder")}
          aria-label=${t("agent.placeholder")}
          .value=${this._input}
          @input=${(e: Event) => (this._input = (e.target as HTMLTextAreaElement).value)}
          @keydown=${this._onKey}
        ></textarea>
        <button
          class="icon-button send"
          type="submit"
          ?disabled=${this._busy || !this._input.trim()}
          aria-label=${t("agent.send")}
          title=${t("agent.send")}
        >
          ${icon(mdiSendOutline)}
        </button>
      </form>`;
  }

  protected override render() {
    const { t } = this;
    return html`
      <button
        class="icon-button opener"
        aria-label=${t("agent.title")}
        aria-expanded=${this._open}
        title=${t("agent.title")}
        @click=${this._toggle}
      >
        ${icon(mdiRobotHappyOutline)}
      </button>
      ${
        this._open
          ? html`<aside class="drawer ${this._wide ? "wide" : ""}" aria-label=${t("agent.title")}>
              <header>
                ${icon(mdiRobotHappyOutline)}
                <h2>${this._listing ? t("agent.chats") : this._title}</h2>
                <button
                  class="icon-button new-chat"
                  ?disabled=${this._busy}
                  aria-label=${t("agent.new")}
                  title=${t("agent.new")}
                  @click=${() => this._newChat()}
                >
                  ${icon(mdiPlus)}
                </button>
                <button
                  class="icon-button history"
                  aria-pressed=${this._listing}
                  ?disabled=${this._busy}
                  aria-label=${t("agent.chats")}
                  title=${t("agent.chats")}
                  @click=${() => (this._listing = !this._listing)}
                >
                  ${icon(mdiHistory)}
                </button>
                <button
                  class="icon-button size"
                  aria-label=${t(this._wide ? "agent.smaller" : "agent.larger")}
                  title=${t(this._wide ? "agent.smaller" : "agent.larger")}
                  @click=${() => this._setWide(!this._wide)}
                >
                  ${icon(this._wide ? mdiArrowCollapseHorizontal : mdiArrowExpandHorizontal)}
                </button>
                <button
                  class="icon-button close"
                  aria-label=${t("common.close")}
                  title=${t("common.close")}
                  @click=${() => (this._open = false)}
                >
                  ${icon(mdiClose)}
                </button>
              </header>
              ${this._renderBody()}
              <pg-confirm-dialog .hass=${this.hass}></pg-confirm-dialog>
            </aside>`
          : nothing
      }
    `;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: inline-flex;
        flex: none;
      }
      .opener {
        color: inherit;
      }
      .opener[aria-expanded="true"] {
        background: rgba(255, 255, 255, 0.18);
      }
      .drawer {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        z-index: 20;
        width: 50vw;
        min-width: 360px;
        max-width: 100vw;
        display: flex;
        flex-direction: column;
        background: var(--pg-surface);
        color: var(--pg-text);
        border-left: 1px solid var(--pg-divider);
        box-shadow: -8px 0 24px rgba(0, 0, 0, 0.18);
        animation: slide 0.18s ease-out;
      }
      .drawer.wide {
        width: 90vw;
      }
      @keyframes slide {
        from {
          transform: translateX(24px);
          opacity: 0;
        }
      }
      @media (max-width: 720px) {
        .drawer,
        .drawer.wide {
          width: 100vw;
          min-width: 0;
        }
        .size {
          display: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .drawer {
          animation: none;
        }
      }
      header {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 8px 8px 8px 16px;
        border-bottom: 1px solid var(--pg-divider);
        flex: none;
      }
      header h2 {
        flex: 1;
        min-width: 0;
        margin: 0 0 0 8px;
        font-size: 18px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      header .icon-button[aria-pressed="true"] {
        background: color-mix(in srgb, var(--pg-accent) 16%, transparent);
        color: var(--pg-accent);
      }
      header .icon-button:disabled {
        opacity: 0.35;
        cursor: default;
      }
      .log {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .empty {
        margin: auto 0;
        text-align: center;
      }
      .list .new {
        align-self: flex-start;
      }
      .chats {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 4px;
      }
      .chats li {
        display: flex;
        align-items: center;
        gap: 4px;
        border: 1px solid var(--pg-divider);
        border-radius: 10px;
      }
      .chats li.current {
        border-color: var(--pg-accent);
      }
      .chat {
        flex: 1;
        min-width: 0;
        display: grid;
        gap: 2px;
        padding: 10px 12px;
        border: none;
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .chat strong {
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 6px;
        margin: 12px 0;
      }
      .chip {
        white-space: normal;
      }
      .message {
        max-width: min(100%, 720px);
      }
      .message p {
        margin: 0;
      }
      .user {
        align-self: flex-end;
        padding: 8px 12px;
        border-radius: 14px 14px 2px 14px;
        background: color-mix(in srgb, var(--pg-accent) 16%, transparent);
        white-space: pre-wrap;
      }
      .assistant {
        align-self: flex-start;
      }
      .assistant .text > :first-child {
        margin-top: 0;
      }
      .assistant .text > :last-child {
        margin-bottom: 0;
      }
      .actions {
        list-style: none;
        margin: 8px 0 0;
        padding: 0;
        display: grid;
        gap: 4px;
      }
      .action {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 4px 4px 10px;
        border: 1px solid var(--pg-divider);
        border-radius: 8px;
        font-size: 14px;
      }
      .action span:first-of-type {
        flex: 1;
      }
      .action .icon {
        color: var(--pg-accent);
        flex: none;
      }
      .action.undone span:first-of-type {
        text-decoration: line-through;
        color: var(--pg-muted);
      }
      .sources {
        margin-top: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 4px 12px;
        color: var(--pg-muted);
      }
      .cost {
        margin-top: 4px;
      }
      .dots {
        display: inline-flex;
        gap: 3px;
        margin-right: 6px;
      }
      .dots i {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: currentColor;
        animation: blink 1.2s infinite;
      }
      .dots i:nth-child(2) {
        animation-delay: 0.2s;
      }
      .dots i:nth-child(3) {
        animation-delay: 0.4s;
      }
      @keyframes blink {
        0%,
        80%,
        100% {
          opacity: 0.25;
        }
        40% {
          opacity: 1;
        }
      }
      .ask {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        padding: 12px 16px 16px;
        border-top: 1px solid var(--pg-divider);
        flex: none;
      }
      .ask textarea {
        flex: 1;
        resize: none;
        font: inherit;
      }
      .send {
        color: var(--pg-accent);
      }
      .send:disabled {
        opacity: 0.35;
        cursor: default;
      }
    `,
  ];
}

define("pg-agent-chat", PgAgentChat);
