import { errorMessage, getLayout, listPlants, subscribeGarden } from "../api/client";
import type { GardenChangeEvent, Layout, Plant, Shape } from "../api/types";
import type { HomeAssistant } from "../types/hass";

/** How long signed photo URLs are trusted before a refresh (backend: 24 h). */
export const STALE_AFTER_MS = 60 * 60 * 1000;
const REFRESH_DEBOUNCE_MS = 150;

export type StoreEvent = "change" | "plant-changed";

/**
 * Keeps plants and the garden layout in sync with the backend.
 *
 * Fires "change" whenever `plants` or `layout` changed and "plant-changed"
 * (detail: GardenChangeEvent) for every backend change, so detail views can
 * reload. Editors apply changes optimistically with patchPlant/putShape/
 * removeShape before the backend confirms; the next refresh brings the
 * authoritative state.
 */
export class GardenStore extends EventTarget {
  plants: Plant[] = [];
  layout: Layout | null = null;
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

  getShape(id: string): Shape | undefined {
    return this.layout?.shapes.find((shape) => shape.id === id);
  }

  /** Reload plants and layout. Concurrent calls share one request. */
  refresh(): Promise<void> {
    this._pending ??= this._load().finally(() => {
      this._pending = undefined;
    });
    return this._pending;
  }

  // ------------------------------------------------------------ optimistic edits
  patchPlant(id: string, changes: Partial<Plant>): void {
    this.plants = this.plants.map((plant) => (plant.id === id ? { ...plant, ...changes } : plant));
    this._emit("change");
  }

  putShape(shape: Shape): void {
    if (!this.layout) return;
    const exists = this.layout.shapes.some((item) => item.id === shape.id);
    const shapes = exists
      ? this.layout.shapes.map((item) => (item.id === shape.id ? shape : item))
      : [...this.layout.shapes, shape];
    this.layout = { ...this.layout, shapes: shapes.sort((a, b) => a.z - b.z) };
    this._emit("change");
  }

  removeShape(id: string): void {
    if (!this.layout) return;
    this.layout = { ...this.layout, shapes: this.layout.shapes.filter((s) => s.id !== id) };
    this._emit("change");
  }

  // ------------------------------------------------------------ internals
  private async _load(): Promise<void> {
    try {
      const [plants, layout] = await Promise.all([
        listPlants(this._hass()),
        getLayout(this._hass()),
      ]);
      this.plants = plants;
      this.layout = layout;
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
