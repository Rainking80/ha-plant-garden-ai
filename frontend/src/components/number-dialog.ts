import { css, html, nothing } from "lit";

import { shared } from "../styles/shared";
import { parseNumber } from "../util/plant-form";
import { PgElement, define } from "./base";

interface Request {
  title: string;
  label: string;
  hint: string;
  value: string;
  resolve: (value: number | null) => void;
}

/** Asks for one positive number. `await dialog.ask(...)` resolves to it or null. */
export class PgNumberDialog extends PgElement {
  static override properties = { _request: { state: true }, _invalid: { state: true } };
  declare _request: Request | undefined;
  declare _invalid: boolean;

  constructor() {
    super();
    this._invalid = false;
  }

  ask(
    title: string,
    label: string,
    hint = "",
    initial: number | null = null,
  ): Promise<number | null> {
    this._request?.resolve(null);
    this._invalid = false;
    return new Promise((resolve) => {
      this._request = {
        title,
        label,
        hint,
        value: initial === null ? "" : String(initial),
        resolve,
      };
      void this.updateComplete.then(() => {
        this.renderRoot.querySelector("dialog")?.showModal();
        this.renderRoot.querySelector("input")?.focus();
      });
    });
  }

  private _finish(value: number | null): void {
    const request = this._request;
    this._request = undefined;
    this.renderRoot.querySelector("dialog")?.close();
    request?.resolve(value);
  }

  private _submit(event: Event): void {
    event.preventDefault();
    const value = parseNumber(this._request?.value ?? "");
    if (value === null || value <= 0) {
      this._invalid = true;
      return;
    }
    this._finish(value);
  }

  protected override render() {
    const request = this._request;
    return html`<dialog @cancel=${() => this._finish(null)} aria-labelledby="title">
      ${
        request
          ? html`<form @submit=${this._submit}>
              <div class="dialog-header"><h2 id="title">${request.title}</h2></div>
              <div class="dialog-body">
                <label class="field">
                  <span>${request.label}</span>
                  <input
                    inputmode="decimal"
                    .value=${request.value}
                    @input=${(e: Event) => {
                      request.value = (e.target as HTMLInputElement).value;
                      this._invalid = false;
                    }}
                  />
                  ${request.hint ? html`<small>${request.hint}</small>` : nothing}
                </label>
                ${
                  this._invalid
                    ? html`<p class="error-text" role="alert">
                        ${this.t("dialog.positive_number")}
                      </p>`
                    : nothing
                }
              </div>
              <div class="dialog-actions">
                <button type="button" class="button text" @click=${() => this._finish(null)}>
                  ${this.t("common.cancel")}
                </button>
                <button type="submit" class="button">${this.t("common.ok")}</button>
              </div>
            </form>`
          : nothing
      }
    </dialog>`;
  }

  static override styles = [
    shared,
    css`
      dialog {
        width: min(400px, calc(100vw - 24px));
      }
    `,
  ];
}

define("pg-number-dialog", PgNumberDialog);
