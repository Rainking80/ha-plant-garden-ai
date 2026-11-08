import {
  careSummary,
  errorMessage,
  getLayout,
  irrigationSummary,
  waterSummary,
  listPlants,
  subscribeGarden,
} from "../api/client";
import type {
  Background,
  CareSummary,
  GardenChangeEvent,
  IrrigationSummary,
  Layout,
  Marker,
  Plant,
  Shape,
  WaterSummary,
} from "../api/types";
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
  /** Water per plant and run time per zone (refreshed on irrigation events). */
  irrigation: IrrigationSummary = { plants: {}, zones: {} };
  /** Weather, soil water per plant and zone advice (refreshed on water events). */
  water: WaterSummary | null = null;
  /** Open tasks, problems and questions per plant (refreshed on care events). */
  care: CareSummary = { plants: {}, garden: {} };
  loaded = false;
  error: string | undefined;
  lastRefresh = 0;

  private _unsubscribe?: () => Promise<void>;
  private _refreshTimer?: ReturnType<typeof setTimeout>;
  private _irrigationTimer?: ReturnType<typeof setTimeout>;
  private _waterTimer?: ReturnType<typeof setTimeout>;
  private _careTimer?: ReturnType<typeof setTimeout>;
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
    clearTimeout(this._irrigationTimer);
    clearTimeout(this._waterTimer);
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

  getMarker(id: string): Marker | undefined {
    return this.layout?.markers.find((marker) => marker.id === id);
  }

  putMarker(marker: Marker): void {
    if (!this.layout) return;
    const others = this.layout.markers.filter((item) => item.id !== marker.id);
    const index = this.layout.markers.findIndex((item) => item.id === marker.id);
    const markers = [...others];
    markers.splice(index === -1 ? others.length : index, 0, marker);
    this.layout = { ...this.layout, markers };
    this._emit("change");
  }

  removeMarker(id: string): void {
    if (!this.layout) return;
    this.layout = { ...this.layout, markers: this.layout.markers.filter((m) => m.id !== id) };
    this._emit("change");
  }

  setBackground(background: Background | null): void {
    if (!this.layout) return;
    this.layout = { ...this.layout, background };
    this._emit("change");
  }

  /** Take over a layout from the backend (after moving the origin) and reload the plants. */
  async applyLayout(layout: Layout): Promise<void> {
    this.layout = layout;
    try {
      this.plants = await listPlants(this._hass()); // their positions changed too
    } catch {
      // the refresh triggered by the change event brings them
    }
    this._emit("change");
  }

  // ------------------------------------------------------------ internals
  private async _load(): Promise<void> {
    try {
      const [plants, layout, irrigation, water, care] = await Promise.all([
        listPlants(this._hass()),
        getLayout(this._hass()),
        irrigationSummary(this._hass()),
        waterSummary(this._hass()),
        careSummary(this._hass()),
      ]);
      this.plants = plants;
      this.layout = layout;
      this.irrigation = irrigation;
      this.water = water;
      this.care = care;
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
    if (event.kind === "irrigation") {
      // runs start and stop often: reload only the irrigation summary
      clearTimeout(this._irrigationTimer);
      this._irrigationTimer = setTimeout(() => void this._loadIrrigation(), REFRESH_DEBOUNCE_MS);
      return;
    }
    if (event.kind === "care" || event.kind === "ai") {
      // tasks, problems, questions, tips, chat - or an AI call (plant fields may change)
      clearTimeout(this._careTimer);
      this._careTimer = setTimeout(() => void this._loadCare(), REFRESH_DEBOUNCE_MS);
      if (event.kind === "care") return;
    }
    if (event.kind === "water") {
      clearTimeout(this._waterTimer);
      this._waterTimer = setTimeout(() => void this._loadWater(), REFRESH_DEBOUNCE_MS);
      return;
    }
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => void this.refresh(), REFRESH_DEBOUNCE_MS);
  }

  private async _loadIrrigation(): Promise<void> {
    try {
      this.irrigation = await irrigationSummary(this._hass());
    } catch {
      return; // the next full refresh brings it
    }
    this._emit("change");
  }

  private async _loadWater(): Promise<void> {
    try {
      this.water = await waterSummary(this._hass());
    } catch {
      return; // the next full refresh brings it
    }
    this._emit("change");
  }

  private async _loadCare(): Promise<void> {
    try {
      this.care = await careSummary(this._hass());
    } catch {
      return; // the next full refresh brings it
    }
    this._emit("change");
  }

  /** Take over a water summary the panel fetched itself (after "refresh weather"). */
  setWater(water: WaterSummary): void {
    this.water = water;
    this._emit("change");
  }

  private _emit(type: StoreEvent): void {
    this.dispatchEvent(new Event(type));
  }
}
