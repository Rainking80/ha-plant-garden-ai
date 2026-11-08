import type { HomeAssistant } from "../types/hass";

export const WS_PREFIX = "plant_garden";

export interface GardenInfo {
  entry_id: string;
  garden_name: string;
  version: string;
  is_admin: boolean;
}

export function fetchInfo(hass: HomeAssistant): Promise<GardenInfo> {
  return hass.callWS<GardenInfo>({ type: `${WS_PREFIX}/info` });
}

/** Turn whatever a failed callWS rejects with into a readable message. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
