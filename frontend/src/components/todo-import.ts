import { mdiClose } from "@mdi/js";
import { css, html, nothing } from "lit";

import { createPlant, errorMessage, listTodoItems, type TodoItem } from "../api/client";
import type { LocationType, PlantCategory } from "../api/types";
import { shared } from "../styles/shared";
import { markerName } from "../util/markers";
import { PgElement, define, icon } from "./base";

const CATEGORY_RULES: [RegExp, PlantCategory][] = [
  [/rasen|wiese|lawn|grass?plot/, "lawn"],
  [/hecke|hedge/, "hedge"],
  [/bonsai|kübel|kuebel|topf|potted/, "potted"],
  [/baum|bäume|baeume|tree/, "tree"],
  [/strauch|sträucher|busch|shrub/, "shrub"],
  [/kräuter|kraeuter|herb|basilikum|minze|petersilie|schnittlauch|thymian|rosmarin|salbei/, "herb"],
  [
    /tomate|gurke|salat|kartoffel|zucchini|paprika|bohne|erbse|karotte|möhre|kohl|kürbis|gemüse|vegetable/,
    "vegetable",
  ],
  [/apfel|birne|kirsch|pflaume|beere|obst|fruit/, "fruit"],
  [/tulpe|narzisse|krokus|zwiebel|bulb/, "bulb"],
  [/efeu|clematis|kletter|wein|climber|ivy/, "climber"],
  [/gras/, "grass"],
];

/** A first guess for the category of an imported plant, from its name. */
export function guessCategory(name: string): PlantCategory {
  const lower = name.toLocaleLowerCase();
  return CATEGORY_RULES.find(([pattern]) => pattern.test(lower))?.[1] ?? "other";
}

function locationFor(category: PlantCategory): LocationType | undefined {
  if (category === "lawn") return "lawn";
  if (category === "potted") return "pot";
  return undefined;
}

interface Row {
  item: TodoItem;
  selected: boolean;
  exists: boolean;
  category: PlantCategory;
}

/**
 * Create plants from the entries of a Home Assistant to-do list (one-time
 * import of an existing plant list). Fires "imported" {count}.
 */
export class PgTodoImport extends PgElement {
  static override properties = {
    existingNames: { attribute: false },
    _entityId: { state: true },
    _rows: { state: true },
    _busy: { state: true },
    _error: { state: true },
    _progress: { state: true },
  };

  declare existingNames: string[];
  declare _entityId: string;
  declare _rows: Row[];
  declare _busy: boolean;
  declare _error: string;
  declare _progress: string;

  constructor() {
    super();
    this.existingNames = [];
    this._entityId = "";
    this._rows = [];
    this._busy = false;
    this._error = "";
    this._progress = "";
  }

  private get _lists(): string[] {
    return Object.keys(this.hass?.states ?? {})
      .filter((id) => id.startsWith("todo."))
      .sort();
  }

  open(): void {
    this._rows = [];
    this._error = "";
    this._progress = "";
    const lists = this._lists;
    const likely = lists.find((id) => /pflanz|plant|garten|garden/i.test(id));
    this._entityId = likely ?? lists[0] ?? "";
    void this.updateComplete.then(() => this.renderRoot.querySelector("dialog")?.showModal());
    if (this._entityId) void this._load();
  }

  close(): void {
    this.renderRoot.querySelector("dialog")?.close();
  }

  private async _load(): Promise<void> {
    this._busy = true;
    this._error = "";
    try {
      const items = await listTodoItems(this.hass, this._entityId);
      const existing = new Set(this.existingNames.map((name) => name.trim().toLocaleLowerCase()));
      this._rows = items
        .filter((item) => item.summary.trim())
        .map((item) => {
          const exists = existing.has(item.summary.trim().toLocaleLowerCase());
          return { item, exists, selected: !exists, category: guessCategory(item.summary) };
        });
    } catch (err) {
      this._rows = [];
      this._error = errorMessage(err);
    } finally {
      this._busy = false;
    }
  }

  private async _import(): Promise<void> {
    const rows = this._rows.filter((row) => row.selected);
    this._busy = true;
    this._error = "";
    let count = 0;
    try {
      for (const row of rows) {
        this._progress = this.t("import.progress", { current: count + 1, total: rows.length });
        const location = locationFor(row.category);
        await createPlant(this.hass, {
          name: row.item.summary.trim().slice(0, 100),
          category: row.category,
          ...(location ? { location_type: location } : {}),
          ...(row.item.description ? { notes: row.item.description } : {}),
        });
        count += 1;
      }
      this.close();
      this.fire("imported", { count });
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = false;
      this._progress = "";
    }
  }

  protected override render() {
    const { t } = this;
    const lists = this._lists;
    const selected = this._rows.filter((row) => row.selected).length;
    return html`<dialog aria-labelledby="title">
      <div class="dialog-header">
        <h2 id="title">${t("import.title")}</h2>
        <button class="icon-button" @click=${this.close} aria-label=${t("common.close")}>
          ${icon(mdiClose)}
        </button>
      </div>
      <div class="dialog-body">
        ${
          lists.length
            ? html`<label class="field">
                <span>${t("import.list")}</span>
                <select
                  @change=${(e: Event) => {
                    this._entityId = (e.target as HTMLSelectElement).value;
                    void this._load();
                  }}
                >
                  ${lists.map(
                    (id) =>
                      html`<option value=${id} ?selected=${id === this._entityId}>
                        ${markerName(this.hass.states[id], id)}
                      </option>`,
                  )}
                </select>
              </label>`
            : html`<p class="muted">${t("import.no_lists")}</p>`
        }
        ${
          this._rows.length
            ? html`<p class="muted small">${t("import.hint")}</p>
                <ul>
                  ${this._rows.map(
                    (row) =>
                      html`<li>
                        <label class="check">
                          <input
                            type="checkbox"
                            .checked=${row.selected}
                            @change=${(e: Event) => {
                              row.selected = (e.target as HTMLInputElement).checked;
                              this.requestUpdate();
                            }}
                          />
                          <span class="name">${row.item.summary}</span>
                          <span class="muted small">
                            ${row.exists ? t("import.exists") : t(`category.${row.category}`)}
                          </span>
                        </label>
                      </li>`,
                  )}
                </ul>`
            : this._entityId && !this._busy && !this._error
              ? html`<p class="muted">${t("import.empty")}</p>`
              : nothing
        }
        ${this._progress ? html`<p class="muted" aria-live="polite">${this._progress}</p>` : nothing}
        ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
      </div>
      <div class="dialog-actions">
        <button class="button text" @click=${this.close}>${t("common.cancel")}</button>
        <button class="button" ?disabled=${this._busy || !selected} @click=${this._import}>
          ${t("import.action", { n: selected })}
        </button>
      </div>
    </dialog>`;
  }

  static override styles = [
    shared,
    css`
      dialog {
        width: min(520px, calc(100vw - 24px));
      }
      .dialog-body {
        display: grid;
        gap: 12px;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 4px;
        max-height: 50vh;
        overflow: auto;
      }
      .check {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 4px;
      }
      .check input {
        width: 18px;
        min-height: 18px;
        height: 18px;
        flex: none;
      }
      .name {
        flex: 1;
      }
      .small {
        font-size: 12px;
        margin: 0;
      }
    `,
  ];
}

define("pg-todo-import", PgTodoImport);
