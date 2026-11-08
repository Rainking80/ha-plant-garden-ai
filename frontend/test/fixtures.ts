import { vi } from "vitest";

import type {
  AIStatus,
  Background,
  Identification,
  IrrigationEvent,
  IrrigationSummary,
  Marker,
  Photo,
  Plant,
  PlantDetail,
  Point,
  PricingInfo,
  Prices,
  Shape,
  TechInfo,
  UsageRow,
  UsageSummary,
  UsageTotals,
  WaterSummary,
} from "../src/api/types";
import type { HomeAssistant } from "../src/types/hass";
import { reproject, type GeoOrigin } from "../src/util/wms";

export function makePlant(overrides: Partial<Plant> = {}): Plant {
  return {
    id: "01JPLANT00000000000000000A",
    name: "Hortensie",
    scientific_name: null,
    variety: null,
    family: null,
    notes: null,
    category: "shrub",
    location_type: "bed",
    light: null,
    water_need: null,
    soil_type: null,
    status: "healthy",
    min_temperature_c: null,
    root_depth_cm: null,
    planted_on: null,
    age: null,
    tags: [],
    created_at: "2026-06-01T08:00:00+00:00",
    updated_at: "2026-06-01T08:00:00+00:00",
    cover_photo_id: null,
    position: null,
    crown_diameter_m: null,
    sources: {
      name: {
        source: "user",
        updated_at: "2026-06-01T08:00:00+00:00",
        confidence: null,
        model: null,
      },
    },
    age_months_now: null,
    photo_count: 0,
    cover: null,
    height_cm: null,
    height_cm_on: null,
    width_cm: null,
    width_cm_on: null,
    ...overrides,
  };
}

export function makePhoto(id: string, takenAt: string, overrides: Partial<Photo> = {}): Photo {
  return {
    id,
    plant_id: "01JPLANT00000000000000000A",
    taken_at: takenAt,
    uploaded_at: takenAt,
    width: 800,
    height: 600,
    size_bytes: 1000,
    tags: [],
    note: "",
    urls: {
      original: `/api/plant_garden/photos/${id}/original?authSig=x`,
      medium: `/api/plant_garden/photos/${id}/medium?authSig=x`,
      thumb: `/api/plant_garden/photos/${id}/thumb?authSig=x`,
    },
    ...overrides,
  };
}

export function makeTotals(overrides: Partial<UsageTotals> = {}): UsageTotals {
  return {
    requests: 0,
    errors: 0,
    input: 0,
    cached_input: 0,
    cache_write: 0,
    output: 0,
    reasoning: 0,
    images: 0,
    cost: null,
    unknown_cost: 0,
    latency_ms: 0,
    ...overrides,
  };
}

export function makeIdentification(overrides: Partial<Identification> = {}): Identification {
  return {
    created: "2026-06-02T10:00:00+00:00",
    photos: ["P1"],
    model: "claude-opus-5-5",
    provider: "Claude",
    plantnet: null,
    result: {
      candidates: [
        {
          scientific_name: "Hydrangea macrophylla",
          common_name_de: "Bauernhortensie",
          common_name_en: "Bigleaf hydrangea",
          variety: null,
          family: "Hydrangeaceae",
          confidence: 0.9,
          reason: "Ballförmige Blütenstände",
        },
      ],
      health: { status: "healthy", summary: "Wirkt gesund." },
      size: { basis: null, confidence: 0.3 },
      care: { pruning: null },
      questions: ["Welche Farbe haben die Blüten?"],
    },
    accepted: [],
    rejected: [],
    suggestions: [
      {
        key: "scientific_name",
        value: "Hydrangea macrophylla",
        confidence: 0.9,
        current: null,
        state: "new",
      },
      { key: "water_need", value: "high", confidence: 0.8, current: "low", state: "differs" },
    ],
    ...overrides,
  };
}

export interface FakeAI {
  status: AIStatus;
  identifications: Record<string, Identification | null>;
  summary: UsageSummary;
  rows: UsageRow[];
  pricing: PricingInfo;
  tech: TechInfo;
}

function fakeAI(overrides: Partial<FakeAI> = {}): FakeAI {
  return {
    status: { available: false, identify: null, plantnet: false, currency: "EUR" },
    identifications: {},
    summary: {
      currency: "EUR",
      rate: 0.9,
      budget: 0,
      budget_stop: false,
      today: makeTotals(),
      month: makeTotals(),
      total: makeTotals(),
      by: { provider: [], model: [], feature: [], plant_id: [] },
      daily: [],
      providers: [],
    },
    rows: [],
    pricing: {
      as_of: "2026-11-08",
      sources: { anthropic: "https://example.invalid/pricing" },
      currency: "EUR",
      prices: { anthropic: { "claude-opus-5-5": { input: 4, output: 20 } } },
      overrides: {},
    },
    tech: {
      version: "0.1.0",
      storage: { photos: 2048, backgrounds: 0, database: 4096 },
      entities: 12,
      plants: 3,
      weather: { updated: null, sources: [], last_error: null },
      providers: [],
    },
    ...overrides,
  };
}

export interface FakeBackend {
  hass: HomeAssistant;
  callWS: ReturnType<typeof vi.fn>;
  /** Push a change event as the backend subscription would. */
  emit: (event: {
    kind: "plant" | "plant_removed" | "layout" | "irrigation" | "water" | "ai";
    plant_id?: string | null;
    shape_id?: string | null;
  }) => void;
  plants: Plant[];
  shapes: Shape[];
  markers: Marker[];
  background: Background | null;
  origin: GeoOrigin;
  todo: Record<string, { uid: string; summary: string; status: string }[]>;
  details: Record<string, PlantDetail>;
  irrigation: IrrigationSummary;
  events: IrrigationEvent[];
  water: WaterSummary;
  ai: FakeAI;
  isAdmin: boolean;
}

/** What the backend does to stored coordinates when the origin moves (keeping places). */
function moveOrigin(backend: FakeBackend, to: GeoOrigin): void {
  const from = backend.origin;
  const shift = (p: Point): Point => reproject(from, to, p);
  backend.plants = backend.plants.map((plant) =>
    plant.position ? { ...plant, position: shift(plant.position) } : plant,
  );
  backend.markers = backend.markers.map((marker) => ({ ...marker, ...shift(marker) }));
  backend.shapes = backend.shapes.map((shape) => {
    const g = shape.geometry;
    if (g.type === "polygon") {
      const points = g.points.map(([x, y]) => {
        const p = shift({ x, y });
        return [p.x, p.y] as [number, number];
      });
      return { ...shape, geometry: { ...g, points } };
    }
    const c = shift({ x: g.cx, y: g.cy });
    return { ...shape, geometry: { ...g, cx: c.x, cy: c.y } };
  });
}

/** A hass object whose callWS answers the plant_garden commands from in-memory data. */
export function fakeBackend(
  options: {
    plants?: Plant[];
    shapes?: Shape[];
    markers?: Marker[];
    background?: Background | null;
    todo?: FakeBackend["todo"];
    states?: Record<string, unknown>;
    details?: Record<string, PlantDetail>;
    irrigation?: IrrigationSummary;
    events?: IrrigationEvent[];
    water?: WaterSummary;
    ai?: Partial<FakeAI>;
    isAdmin?: boolean;
    language?: string;
  } = {},
): FakeBackend {
  const backend = {
    plants: options.plants ?? [],
    shapes: options.shapes ?? [],
    details: options.details ?? {},
    markers: options.markers ?? [],
    background: options.background ?? null,
    origin: { latitude: 52.4, longitude: 13.06 },
    todo: options.todo ?? {},
    irrigation: options.irrigation ?? { plants: {}, zones: {} },
    events: options.events ?? [],
    water: options.water ?? { configured: false, updated: null, sources: [], weather: [] },
    ai: fakeAI(options.ai),
    isAdmin: options.isAdmin ?? true,
  } as FakeBackend;
  const layout = () => ({
    origin: backend.origin,
    shapes: backend.shapes,
    background: backend.background,
    markers: backend.markers,
  });
  let listener: ((event: unknown) => void) | undefined;
  backend.callWS = vi.fn(async (msg: Record<string, unknown> & { type: string }) => {
    switch (msg.type) {
      case "plant_garden/info":
        return {
          entry_id: "e",
          garden_name: "Schrebergarten",
          version: "0.1.0",
          is_admin: backend.isAdmin,
        };
      case "plant_garden/plants/list":
        return { plants: backend.plants };
      case "plant_garden/plants/create": {
        const { type: _type, ...fields } = msg;
        const plant = makePlant({
          id: `NEW${backend.plants.length}`,
          ...(fields as Partial<Plant>),
        });
        backend.plants = [...backend.plants, plant];
        return plant;
      }
      case "plant_garden/plants/get": {
        const detail = backend.details[String(msg.plant_id ?? "")];
        if (!detail) throw { code: "not_found", message: "Not found" };
        return detail;
      }
      case "plant_garden/layout/get":
        return layout();
      case "plant_garden/layout/set_background": {
        const bg = msg.background as Background | { type: "none" };
        backend.background = bg.type === "none" ? null : (bg as Background);
        if (backend.background?.type === "image") {
          backend.background = { ...backend.background, url: "/bg.jpg?authSig=x" };
        }
        return layout();
      }
      case "plant_garden/layout/set_origin": {
        const to = { latitude: Number(msg.latitude), longitude: Number(msg.longitude) };
        if (!msg.move_content) moveOrigin(backend, to);
        backend.origin = to;
        return layout();
      }
      case "plant_garden/layout/markers/save": {
        const marker = msg.marker as Marker;
        backend.markers = [...backend.markers.filter((m) => m.id !== marker.id), marker];
        return marker;
      }
      case "plant_garden/layout/markers/delete":
        backend.markers = backend.markers.filter((m) => m.id !== msg.marker_id);
        return null;
      case "todo/item/list":
        return { items: backend.todo[String(msg.entity_id)] ?? [] };
      case "history/history_during_period":
        return {
          [String((msg.entity_ids as string[])[0])]: [
            { s: "70", lu: 1 },
            { s: "65", lu: 2 },
          ],
        };
      case "plant_garden/plants/move": {
        const moves = msg.moves as { plant_id: string; position: Point | null }[];
        backend.plants = backend.plants.map((plant) => {
          const move = moves.find((m) => m.plant_id === plant.id);
          return move ? { ...plant, position: move.position } : plant;
        });
        return { positions: {} };
      }
      case "plant_garden/plants/update": {
        const { type: _type, plant_id: plantId, ...fields } = msg;
        backend.plants = backend.plants.map((plant) =>
          plant.id === plantId ? { ...plant, ...fields } : plant,
        );
        return backend.plants.find((plant) => plant.id === plantId);
      }
      case "plant_garden/layout/shapes/save": {
        const shape = msg.shape as Shape;
        backend.shapes = [...backend.shapes.filter((s) => s.id !== shape.id), shape];
        return shape;
      }
      case "plant_garden/layout/shapes/delete":
        backend.shapes = backend.shapes.filter((s) => s.id !== msg.shape_id);
        return null;
      case "plant_garden/water/summary":
      case "plant_garden/water/refresh":
        return backend.water;
      case "plant_garden/irrigation/summary":
        return backend.irrigation;
      case "plant_garden/irrigation/events":
        return {
          events: backend.events.filter(
            (event) =>
              (!msg.zone_id || event.zone_id === msg.zone_id) &&
              (!msg.plant_id || event.plants.some((p) => p.plant_id === msg.plant_id)),
          ),
        };
      case "plant_garden/irrigation/log": {
        const plants = msg.plants as { plant_id: string; liters: number }[];
        const now = new Date().toISOString();
        const event: IrrigationEvent = {
          id: `EV${backend.events.length}`,
          zone_id: null,
          started_at: now,
          ended_at: now,
          duration_s: 0,
          day: now.slice(0, 10),
          source: "manual",
          liters: plants.reduce((sum, p) => sum + p.liters, 0),
          depth_mm: null,
          uncertain: false,
          reconstructed: false,
          note: String(msg.note ?? ""),
          plants: plants.map((p) => ({ ...p, mm: p.liters })),
        };
        backend.events = [event, ...backend.events];
        return event;
      }
      case "plant_garden/irrigation/delete":
        backend.events = backend.events.filter((event) => event.id !== msg.event_id);
        return null;
      case "plant_garden/ai/status":
        return backend.ai.status;
      case "plant_garden/ai/identification":
        return backend.ai.identifications[String(msg.plant_id)] ?? null;
      case "plant_garden/ai/estimate":
        return { cost: 0.0123, currency: backend.ai.status.currency };
      case "plant_garden/ai/identify": {
        const photos = msg.photos as { photo_id: string }[];
        const record = makeIdentification({ photos: photos.map((p) => p.photo_id) });
        backend.ai.identifications[String(msg.plant_id)] = record;
        return record;
      }
      case "plant_garden/ai/decide": {
        const record = backend.ai.identifications[String(msg.plant_id)];
        if (!record) throw { code: "not_found", message: "Not found" };
        const state = msg.accept ? "accepted" : "rejected";
        const updated: Identification = {
          ...record,
          suggestions: record.suggestions.map((s) => (s.key === msg.key ? { ...s, state } : s)),
        };
        backend.ai.identifications[String(msg.plant_id)] = updated;
        return updated;
      }
      case "plant_garden/ai/usage/summary":
        return backend.ai.summary;
      case "plant_garden/ai/usage/log": {
        const rows = backend.ai.rows.filter(
          (row) =>
            (!msg.feature || row.feature === msg.feature) &&
            (!msg.status || row.status === msg.status),
        );
        const offset = Number(msg.offset ?? 0);
        return { rows: rows.slice(offset, offset + Number(msg.limit ?? 100)) };
      }
      case "plant_garden/ai/pricing/get":
        return backend.ai.pricing;
      case "plant_garden/ai/pricing/set": {
        const kind = String(msg.kind);
        const model = String(msg.model);
        const overrides = { ...backend.ai.pricing.overrides };
        const own = Object.fromEntries(
          Object.entries(overrides[kind] ?? {}).filter(([name]) => name !== model),
        );
        if (msg.prices !== null) own[model] = msg.prices as Prices;
        overrides[kind] = own;
        const prices = { ...backend.ai.pricing.prices };
        prices[kind] = { ...prices[kind], ...own };
        backend.ai.pricing = { ...backend.ai.pricing, overrides, prices };
        return backend.ai.pricing;
      }
      case "plant_garden/ai/test":
        backend.ai.tech = {
          ...backend.ai.tech,
          providers: backend.ai.tech.providers.map((p) =>
            p.id === msg.provider_id
              ? { ...p, status: { ok: true, error: null, checked: "2026-06-02T10:00:00+00:00" } }
              : p,
          ),
        };
        return { ok: true, error: null };
      case "plant_garden/tech/info":
        return backend.ai.tech;
      default:
        throw new Error(`unexpected ${msg.type}`);
    }
  });
  const language = options.language ?? "de";
  backend.hass = {
    callWS: backend.callWS,
    language,
    locale: { language },
    themes: { darkMode: false },
    config: { latitude: 52.4, longitude: 13.06 },
    states: options.states ?? {},
    connection: {
      subscribeMessage: vi.fn(async (callback: (event: unknown) => void) => {
        listener = callback;
        return async () => {
          listener = undefined;
        };
      }),
    },
    fetchWithAuth: vi.fn(),
  } as unknown as HomeAssistant;
  backend.emit = (event) => listener?.(event);
  return backend;
}

/** Text of an element including all nested shadow roots. */
export function deepText(node: Node): string {
  let text = "";
  if (node instanceof Element && node.shadowRoot) text += deepText(node.shadowRoot);
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) text += child.textContent ?? "";
    else if (child.nodeName !== "STYLE") text += deepText(child);
  }
  return text.replace(/\s+/g, " ");
}

/**
 * querySelector that descends into shadow roots. The selector must match within
 * one shadow root (use the innermost element, e.g. "a.card", not "pg-card a").
 * (In happy-dom a ShadowRoot is not an instance of the global DocumentFragment,
 * hence the duck typing.)
 */
export function deepQuery<T extends Element>(root: Node, selector: string): T | null {
  const scope = (root instanceof Element && root.shadowRoot ? root.shadowRoot : root) as Partial<
    Pick<ParentNode, "querySelector" | "querySelectorAll">
  >;
  if (!scope.querySelector || !scope.querySelectorAll) return null;
  const direct = scope.querySelector<T>(selector);
  if (direct) return direct;
  for (const element of scope.querySelectorAll("*")) {
    if (element.shadowRoot) {
      const found = deepQuery<T>(element, selector);
      if (found) return found;
    }
  }
  return null;
}

/** Like deepQuery, but fails the test instead of returning null. */
export function deepGet<T extends Element>(root: Node, selector: string): T {
  const found = deepQuery<T>(root, selector);
  if (!found) throw new Error(`no element matches ${selector}`);
  return found;
}
