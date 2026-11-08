import { css, html } from "lit";

import "../components/assistant-panel";
import { PgElement, define } from "../components/base";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";

/** The garden assistant: chat about the whole garden, garden tips, open questions. */
export class PgAssistantView extends PgElement {
  static override properties = {
    store: { attribute: false },
    prefix: { attribute: false },
  };

  declare store: GardenStore;
  declare prefix: string;

  protected override render() {
    return html`<section class="card block">
      <pg-assistant-panel
        .hass=${this.hass}
        .store=${this.store}
        .plantId=${null}
        .prefix=${this.prefix}
      ></pg-assistant-panel>
    </section>`;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: block;
      }
      .block {
        padding: 16px;
      }
    `,
  ];
}

define("pg-assistant-view", PgAssistantView);
