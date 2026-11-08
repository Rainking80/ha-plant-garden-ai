import { css, html } from "lit";

import { shared } from "../styles/shared";
import { PgElement, define } from "./base";

interface Request {
  title: string;
  body: string;
  confirm: string;
  resolve: (ok: boolean) => void;
}

/** A small modal yes/no dialog. `await dialog.ask(...)` resolves to the answer. */
export class PgConfirmDialog extends PgElement {
  static override properties = { _request: { state: true } };
  declare _request: Request | undefined;

  ask(title: string, body: string, confirm: string): Promise<boolean> {
    this._request?.resolve(false);
    return new Promise((resolve) => {
      this._request = { title, body, confirm, resolve };
      void this.updateComplete.then(() => this.renderRoot.querySelector("dialog")?.showModal());
    });
  }

  private _answer(ok: boolean): void {
    const request = this._request;
    this._request = undefined;
    this.renderRoot.querySelector("dialog")?.close();
    request?.resolve(ok);
  }

  protected override render() {
    const request = this._request;
    return html`
      <dialog @cancel=${() => this._answer(false)} aria-labelledby="title">
        ${
          request
            ? html`
                <div class="dialog-header"><h2 id="title">${request.title}</h2></div>
                <div class="dialog-body"><p>${request.body}</p></div>
                <div class="dialog-actions">
                  <button class="button text" @click=${() => this._answer(false)}>
                    ${this.t("common.cancel")}
                  </button>
                  <button class="button danger" @click=${() => this._answer(true)}>
                    ${request.confirm}
                  </button>
                </div>
              `
            : ""
        }
      </dialog>
    `;
  }

  static override styles = [
    shared,
    css`
      dialog {
        width: min(420px, calc(100vw - 24px));
      }
      p {
        margin: 0;
        line-height: 1.5;
      }
    `,
  ];
}

define("pg-confirm-dialog", PgConfirmDialog);
