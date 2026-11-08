import { errorMessage, listPlants, subscribeGarden } from "../api/client";
import type { GardenChangeEvent, Plant } from "../api/types";
import type { HomeAssistant } from "../types/hass";

/** How long signed photo URLs are trusted before a refresh (backend: 24 h). */
export const STALE_AFTER_MS = 60 * 60 * 1000;
const REFRESH_DEBOUNCE_MS = 150;

export type StoreEvent = "change" | "plant-changed";

/**
 * Keeps the plant list in sync with the backend.
 *
 * Fires "change" when `plants` was replaced and "plant-changed" (detail:
 * GardenChangeEvent) for every backend change, so detail views can reload.
 */
export class GardenStore extends EventTarget {
  plants: Plant[] = [];
  loaded = false;
  error: string | undefined;
  lastRefresh = 0;

  private _unsubscribe?: () => Promise<void>;
  private _refreshTimer?: ReturnType<typeof setTimeout>;
  private _pending?: Promise<void>;

  constructor(private readonly _hass: () => HomeAssistant) {
    super();
  }

  async connect(): Promise<void> {
    if (this._unsubscribe) return;
    try {
      this._unsubscribe = await subscribeGarden(this._hass(), (event) => this._onChange(event));
    } catch (err) {
      this.error = errorMessage(err);
      this._emit("change");
      return;
    }
    await this.refresh();
  }

  async disconnect(): Promise<void> {
    clearTimeout(this._refreshTimer);
    const unsubscribe = this._unsubscribe;
    this._unsubscribe = undefined;
    try {
      await unsubscribe?.();
    } catch {
      // connection already gone
    }
  }

  get stale(): boolean {
    return Date.now() - this.lastRefresh > STALE_AFTER_MS;
  }

  getPlant(id: string): Plant | undefined {
    return this.plants.find((plant) => plant.id === id);
  }

  /** Reload the plant list. Concurrent calls share one request. */
  refresh(): Promise<void> {
    this._pending ??= this._load().finally(() => {
      this._pending = undefined;
    });
    return this._pending;
  }

  private async _load(): Promise<void> {
    try {
      this.plants = await listPlants(this._hass());
      this.error = undefined;
      this.loaded = true;
      this.lastRefresh = Date.now();
    } catch (err) {
      this.error = errorMessage(err);
    }
    this._emit("change");
  }

  private _onChange(event: GardenChangeEvent): void {
    this.dispatchEvent(new CustomEvent<GardenChangeEvent>("plant-changed", { detail: event }));
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => void this.refresh(), REFRESH_DEBOUNCE_MS);
  }

  private _emit(type: StoreEvent): void {
    this.dispatchEvent(new Event(type));
  }
}
