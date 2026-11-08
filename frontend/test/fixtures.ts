import { vi } from "vitest";

import type { Photo, Plant, PlantDetail, Point, Shape } from "../src/api/types";
import type { HomeAssistant } from "../src/types/hass";

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

export interface FakeBackend {
  hass: HomeAssistant;
  callWS: ReturnType<typeof vi.fn>;
  /** Push a change event as the backend subscription would. */
  emit: (event: {
    kind: "plant" | "plant_removed" | "layout";
    plant_id?: string | null;
    shape_id?: string | null;
  }) => void;
  plants: Plant[];
  shapes: Shape[];
  details: Record<string, PlantDetail>;
}

/** A hass object whose callWS answers the plant_garden commands from in-memory data. */
export function fakeBackend(
  options: {
    plants?: Plant[];
    shapes?: Shape[];
    details?: Record<string, PlantDetail>;
    language?: string;
  } = {},
): FakeBackend {
  const backend = {
    plants: options.plants ?? [],
    shapes: options.shapes ?? [],
    details: options.details ?? {},
  } as FakeBackend;
  let listener: ((event: unknown) => void) | undefined;
  backend.callWS = vi.fn(async (msg: Record<string, unknown> & { type: string }) => {
    switch (msg.type) {
      case "plant_garden/info":
        return { entry_id: "e", garden_name: "Schrebergarten", version: "0.1.0", is_admin: true };
      case "plant_garden/plants/list":
        return { plants: backend.plants };
      case "plant_garden/plants/get": {
        const detail = backend.details[String(msg.plant_id ?? "")];
        if (!detail) throw { code: "not_found", message: "Not found" };
        return detail;
      }
      case "plant_garden/layout/get":
        return { origin: { latitude: 52.4, longitude: 13.06 }, shapes: backend.shapes };
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
    states: {},
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
