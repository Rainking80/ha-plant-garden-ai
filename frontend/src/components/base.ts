import { LitElement, html, type PropertyDeclarations } from "lit";

import { createLocalize, type Localize } from "../i18n";
import type { HomeAssistant } from "../types/hass";

/** Base for all panel elements: `hass` plus a cached localize function. */
export class PgElement extends LitElement {
  // Subclasses list only their own properties; Lit merges them with these.
  static override properties: PropertyDeclarations = {
    hass: { attribute: false },
  };

  declare hass: HomeAssistant;

  private _language?: string;
  private _localize?: Localize;

  protected get language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  protected get t(): Localize {
    const language = this.language;
    if (!this._localize || language !== this._language) {
      this._language = language;
      this._localize = createLocalize(language);
    }
    return this._localize;
  }

  /** Dispatch a bubbling, composed event (crosses shadow roots). */
  protected fire<T>(type: string, detail?: T): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

export const icon = (path: string, label?: string) =>
  label
    ? html`<svg class="icon" viewBox="0 0 24 24" role="img" aria-label=${label}>
        <path d=${path}></path>
      </svg>`
    : html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d=${path}></path></svg>`;

/** Register a custom element once (the bundle may be evaluated twice). */
export function define(name: string, element: CustomElementConstructor): void {
  if (!customElements.get(name)) customElements.define(name, element);
}
