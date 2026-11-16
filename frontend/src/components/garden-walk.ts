import {
  mdiAlertCircleOutline,
  mdiCameraOutline,
  mdiCheck,
  mdiImageMultipleOutline,
  mdiMapMarkerCheckOutline,
} from "@mdi/js";
import { css, html, nothing } from "lit";

import {
  aiStatus,
  createPlant,
  errorMessage,
  estimateIdentify,
  identifyPlant,
  uploadPhoto,
} from "../api/client";
import type { Plant } from "../api/types";
import { shared } from "../styles/shared";
import { formatMoney } from "../util/format";
import { prepareImage } from "../util/image";
import { navigate } from "../util/navigate";
import { canPickSeveralFiles, suggestedPosition, uploadErrorText } from "../util/upload";
import type { GeoOrigin } from "../util/wms";
import { PgElement, define, icon } from "./base";
import { plantPath } from "./plant-card";

const IDENTIFY_KEY = "plant-garden.walk-identify.v1";

type Step = "waiting" | "uploading" | "identifying" | "done" | "failed";

interface WalkItem {
  key: number;
  file: File;
  preview: string;
  step: Step;
  plant: Plant | null;
  /** the photo's GPS put it on the plan */
  placed: boolean;
  /** the AI named the plant */
  named: boolean;
  error: string;
}

/** The next free "New plant n" among the garden's names. */
export function placeholderName(base: string, existing: string[], offset = 0): string {
  const used = new Set(existing);
  let n = 1;
  let skipped = 0;
  for (;;) {
    const name = `${base} ${n}`;
    if (!used.has(name)) {
      if (skipped === offset) return name;
      skipped += 1;
    }
    n += 1;
  }
}

/**
 * The garden walk: photograph one plant after the other; every photo becomes a
 * plant. The photo's GPS suggests its place on the plan and, if the user
 * switches it on, the AI identifies and names it. Fires "walk-finished" when
 * closed after something was added.
 */
export class PgGardenWalk extends PgElement {
  static override properties = {
    origin: { attribute: false },
    existingNames: { attribute: false },
    prefix: {},
    _items: { state: true },
    _identify: { state: true },
    _available: { state: true },
    _estimate: { state: true },
  };

  declare origin: GeoOrigin | null;
  declare existingNames: string[];
  declare prefix: string;
  declare _items: WalkItem[];
  declare _identify: boolean;
  declare _available: boolean;
  declare _estimate: string;

  private _next = 0;
  private _running = false;

  constructor() {
    super();
    this.origin = null;
    this.existingNames = [];
    this.prefix = "/plant-garden";
    this._items = [];
    this._identify = false;
    this._available = false;
    this._estimate = "";
  }

  open(): void {
    this._items = [];
    void this._loadAi();
    void this.updateComplete.then(() => this.renderRoot.querySelector("dialog")?.showModal());
  }

  close(): void {
    this.renderRoot.querySelector("dialog")?.close();
    this._closed();
  }

  private _closed(): void {
    for (const item of this._items) URL.revokeObjectURL(item.preview);
    if (this._items.some((item) => item.plant)) this.fire("walk-finished", {});
    this._items = [];
  }

  /** Is an AI for photos set up, and what does one photo cost? */
  private async _loadAi(): Promise<void> {
    try {
      const status = await aiStatus(this.hass);
      this._available = status.available;
      if (!status.available) {
        this._identify = false;
        return;
      }
      try {
        this._identify = localStorage.getItem(IDENTIFY_KEY) === "true";
      } catch {
        this._identify = false;
      }
      const estimate = await estimateIdentify(this.hass, 1);
      this._estimate =
        estimate.cost === null ? "" : formatMoney(estimate.cost, estimate.currency, this.language);
    } catch {
      this._available = false;
      this._identify = false;
    }
  }

  private _setIdentify(on: boolean): void {
    this._identify = on;
    try {
      localStorage.setItem(IDENTIFY_KEY, String(on));
    } catch {
      // private mode: asked again next time
    }
  }

  private _onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = "";
    if (!files.length) return;
    this._items = [
      ...this._items,
      ...files.map((file) => ({
        key: this._next++,
        file,
        preview: URL.createObjectURL(file),
        step: "waiting" as Step,
        plant: null,
        placed: false,
        named: false,
        error: "",
      })),
    ];
    void this._run();
  }

  private _patch(key: number, changes: Partial<WalkItem>): void {
    this._items = this._items.map((item) => (item.key === key ? { ...item, ...changes } : item));
  }

  /** Work through the photos one after the other. */
  private async _run(): Promise<void> {
    if (this._running) return;
    this._running = true;
    try {
      for (;;) {
        const item = this._items.find((candidate) => candidate.step === "waiting");
        if (!item) break;
        await this._process(item);
      }
    } finally {
      this._running = false;
    }
  }

  private async _process(item: WalkItem): Promise<void> {
    const { key } = item;
    this._patch(key, { step: "uploading" });
    let plant: Plant;
    try {
      const prepared = await prepareImage(item.file);
      const position = suggestedPosition(prepared.gps, this.origin);
      const taken = this._items.flatMap((other) => (other.plant ? [other.plant.name] : []));
      plant = await createPlant(this.hass, {
        name: placeholderName(this.t("walk.new_plant"), [...this.existingNames, ...taken]),
        ...(position ? { position } : {}),
      });
      this._patch(key, { plant, placed: Boolean(position) });
      const photo = await uploadPhoto(this.hass, {
        plantId: plant.id,
        file: prepared.blob,
        filename: prepared.filename,
        takenAt: prepared.takenAt,
      });
      if (!this._identify) {
        this._patch(key, { step: "done" });
        return;
      }
      this._patch(key, { step: "identifying" });
      try {
        const result = await identifyPlant(
          this.hass,
          plant.id,
          [{ photo_id: photo.id, organ: "auto" }],
          true,
        );
        const top = result.result?.candidates[0];
        const name =
          result.named && top
            ? ((this.language === "de" ? top.common_name_de : top.common_name_en) ??
              top.scientific_name)
            : plant.name;
        this._patch(key, {
          step: "done",
          named: Boolean(result.named),
          plant: { ...plant, name, scientific_name: top?.scientific_name ?? null },
        });
      } catch (err) {
        // the plant and its photo are there; only the identification failed
        this._patch(key, { step: "done", error: errorMessage(err) });
      }
    } catch (err) {
      this._patch(key, { step: "failed", error: uploadErrorText(err, this.t) });
    }
  }

  /** Open a plant's page inside the panel (a plain link would reload Home Assistant). */
  private _openPlant(event: Event, plant: Plant | null): void {
    event.preventDefault();
    if (!plant || this._items.some((item) => !["done", "failed"].includes(item.step))) return;
    this.close();
    navigate(plantPath(plant, this.prefix));
  }

  private _status(item: WalkItem) {
    const { t } = this;
    if (item.step === "failed") {
      return html`<span class="error-text">${icon(mdiAlertCircleOutline)} ${item.error}</span>`;
    }
    if (item.step !== "done") {
      return html`<span class="muted">${t(`walk.${item.step}`)}</span>`;
    }
    return html`<span class="muted small">
      ${item.plant?.scientific_name ? html`<em>${item.plant.scientific_name}</em> · ` : nothing}
      ${
        item.placed
          ? html`${icon(mdiMapMarkerCheckOutline)} ${t("walk.placed")}`
          : t("walk.not_placed")
      }
      ${item.error ? html`<br /><span class="error-text">${item.error}</span>` : nothing}
      ${this._identify && !item.named && !item.error ? html`<br />${t("walk.unsure")}` : nothing}
    </span>`;
  }

  protected override render() {
    const { t } = this;
    const busy = this._items.some((item) => !["done", "failed"].includes(item.step));
    const added = this._items.filter((item) => item.plant).length;
    return html`<dialog @close=${() => this._closed()} aria-labelledby="title">
      <div class="dialog-header"><h2 id="title">${t("walk.title")}</h2></div>
      <div class="dialog-body">
        <p>${t("walk.intro")}</p>
        ${
          this._available
            ? html`<label class="check">
                <input
                  type="checkbox"
                  .checked=${this._identify}
                  @change=${(e: Event) => this._setIdentify((e.target as HTMLInputElement).checked)}
                />
                <span>
                  ${t("walk.identify")}
                  ${
                    this._estimate
                      ? html`<small class="muted"
                          >${t("walk.identify_cost", { cost: this._estimate })}</small
                        >`
                      : nothing
                  }
                </span>
              </label>`
            : html`<p class="muted small">${t("walk.no_ai")}</p>`
        }
        <div class="pick">
          <label class="button">
            ${icon(mdiCameraOutline)} ${t("walk.take_photo")}
            <input type="file" accept="image/*" capture="environment" @change=${this._onFiles} />
          </label>
          <label class="button secondary">
            ${icon(mdiImageMultipleOutline)} ${t("walk.choose_photos")}
            <input
              type="file"
              accept="image/*"
              ?multiple=${canPickSeveralFiles()}
              @change=${this._onFiles}
            />
          </label>
        </div>
        ${
          this._items.length
            ? html`<ul class="items">
                ${this._items.map(
                  (item) =>
                    html`<li>
                      <img src=${item.preview} alt="" />
                      <div>
                        ${
                          item.plant
                            ? html`<a
                                href=${plantPath(item.plant, this.prefix)}
                                @click=${(e: Event) => this._openPlant(e, item.plant)}
                              >
                                ${item.step === "done" ? icon(mdiCheck) : nothing}
                                <strong>${item.plant.name}</strong>
                              </a>`
                            : html`<strong>${item.file.name}</strong>`
                        }
                        ${this._status(item)}
                      </div>
                    </li>`,
                )}
              </ul>`
            : nothing
        }
      </div>
      <div class="dialog-actions">
        <span class="muted small"
          >${added ? t(added === 1 ? "walk.added_one" : "walk.added", { count: added }) : ""}</span
        >
        <button type="button" class="button text" ?disabled=${busy} @click=${() => this.close()}>
          ${t(busy ? "walk.working" : "walk.done")}
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
      .check {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        margin: 8px 0 12px;
      }
      .check small {
        display: block;
      }
      .pick {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .pick input {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }
      .pick label {
        position: relative;
        cursor: pointer;
      }
      .items {
        list-style: none;
        margin: 16px 0 0;
        padding: 0;
        display: grid;
        gap: 8px;
      }
      .items li {
        display: grid;
        grid-template-columns: 56px 1fr;
        gap: 12px;
        align-items: center;
      }
      .items img {
        width: 56px;
        height: 56px;
        border-radius: 8px;
        object-fit: cover;
      }
      .items a {
        display: flex;
        align-items: center;
        gap: 4px;
        color: inherit;
        text-decoration: none;
      }
      .items a .icon {
        color: var(--pg-accent);
      }
      .dialog-actions {
        justify-content: space-between;
        align-items: center;
      }
    `,
  ];
}

define("pg-garden-walk", PgGardenWalk);
