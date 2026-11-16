import { mdiCreationOutline } from "@mdi/js";
import { css, html, nothing } from "lit";

import { errorMessage, sketchPlan } from "../api/client";
import type { SketchResult, SketchShape } from "../api/types";
import { shared } from "../styles/shared";
import { formatNumber } from "../util/format";
import { PgElement, define, icon } from "./base";

/**
 * A plan from a picture: the AI outlines the areas it sees in the uploaded plan
 * background; the user ticks which to take over. Fires "shapes-chosen"
 * {shapes} - the plan view creates them (undoable).
 */
export class PgSketchImport extends PgElement {
  static override properties = {
    _result: { state: true },
    _chosen: { state: true },
    _busy: { state: true },
    _error: { state: true },
  };

  declare _result: SketchResult | null;
  /** indexes of the areas to take over */
  declare _chosen: ReadonlySet<number>;
  declare _busy: boolean;
  declare _error: string;

  constructor() {
    super();
    this._result = null;
    this._chosen = new Set();
    this._busy = false;
    this._error = "";
  }

  open(): void {
    this._result = null;
    this._chosen = new Set();
    this._error = "";
    void this.updateComplete.then(() => this.renderRoot.querySelector("dialog")?.showModal());
  }

  close(): void {
    this.renderRoot.querySelector("dialog")?.close();
  }

  private async _ask(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    this._error = "";
    try {
      const result = await sketchPlan(this.hass);
      this._result = result;
      this._chosen = new Set(result.shapes.map((_, index) => index));
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = false;
    }
  }

  private _toggle(index: number): void {
    const chosen = new Set(this._chosen);
    if (!chosen.delete(index)) chosen.add(index);
    this._chosen = chosen;
  }

  private _take(): void {
    const shapes = (this._result?.shapes ?? []).filter((_, index) => this._chosen.has(index));
    this.close();
    if (shapes.length) this.fire<{ shapes: SketchShape[] }>("shapes-chosen", { shapes });
  }

  protected override render() {
    const { t, language } = this;
    const result = this._result;
    return html`<dialog aria-labelledby="title">
      <div class="dialog-header"><h2 id="title">${t("sketch.title")}</h2></div>
      <div class="dialog-body">
        <p>${t("sketch.intro")}</p>
        ${
          result
            ? nothing
            : html`<button class="button" ?disabled=${this._busy} @click=${this._ask}>
                ${icon(mdiCreationOutline)} ${t(this._busy ? "sketch.asking" : "sketch.ask")}
              </button>`
        }
        ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
        ${result?.note ? html`<p class="muted">${result.note}</p>` : nothing}
        ${
          result
            ? result.shapes.length
              ? html`<ul class="areas">
                  ${result.shapes.map(
                    (shape, index) =>
                      html`<li>
                        <label>
                          <input
                            type="checkbox"
                            .checked=${this._chosen.has(index)}
                            @change=${() => this._toggle(index)}
                          />
                          <span>
                            <strong>${t(`kind.${shape.kind}`)}</strong>
                            ${shape.label ? html`„${shape.label}“` : nothing}
                            <span class="muted small"
                              >${formatNumber(shape.area_m2, language, 1)} m²</span
                            >
                          </span>
                        </label>
                      </li>`,
                  )}
                </ul>`
              : html`<p class="muted">${t("sketch.none")}</p>`
            : nothing
        }
      </div>
      <div class="dialog-actions">
        <button type="button" class="button text" @click=${() => this.close()}>
          ${t("common.cancel")}
        </button>
        ${
          result?.shapes.length
            ? html`<button class="button take" ?disabled=${!this._chosen.size} @click=${this._take}>
                ${t("sketch.take", { count: this._chosen.size })}
              </button>`
            : nothing
        }
      </div>
    </dialog>`;
  }

  static override styles = [
    shared,
    css`
      dialog {
        width: min(480px, calc(100vw - 24px));
      }
      .areas {
        list-style: none;
        margin: 8px 0 0;
        padding: 0;
        display: grid;
        gap: 6px;
      }
      .areas label {
        display: flex;
        gap: 8px;
        align-items: center;
        cursor: pointer;
      }
    `,
  ];
}

define("pg-sketch-import", PgSketchImport);
