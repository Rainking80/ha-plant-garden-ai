/** Icons and value text for entity markers on the plan. */
import {
  mdiBattery,
  mdiCheckboxMarkedCircleOutline,
  mdiGauge,
  mdiRobotMower,
  mdiSprinklerVariant,
  mdiStorageTankOutline,
  mdiThermometer,
  mdiToggleSwitchOutline,
  mdiValve,
  mdiWater,
  mdiWaterPercent,
  mdiWeatherPartlyCloudy,
  mdiWeatherRainy,
  mdiWhiteBalanceSunny,
} from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";

import type { Localize, TranslationKey } from "../i18n";
import { formatNumber } from "./format";

const DEVICE_CLASS_ICONS: Record<string, string> = {
  moisture: mdiWaterPercent,
  humidity: mdiWaterPercent,
  temperature: mdiThermometer,
  battery: mdiBattery,
  illuminance: mdiWhiteBalanceSunny,
  irradiance: mdiWhiteBalanceSunny,
  precipitation: mdiWeatherRainy,
  precipitation_intensity: mdiWeatherRainy,
  volume: mdiStorageTankOutline,
  volume_storage: mdiStorageTankOutline,
  water: mdiWater,
};

const DOMAIN_ICONS: Record<string, string> = {
  lawn_mower: mdiRobotMower,
  weather: mdiWeatherPartlyCloudy,
  valve: mdiValve,
  switch: mdiToggleSwitchOutline,
  input_boolean: mdiToggleSwitchOutline,
  binary_sensor: mdiCheckboxMarkedCircleOutline,
};

/** An MDI path that fits the entity (HA's own icon names cannot be resolved offline). */
export function markerIcon(entityId: string, state: HassEntity | undefined): string {
  const deviceClass = state?.attributes.device_class as string | undefined;
  if (deviceClass && DEVICE_CLASS_ICONS[deviceClass]) return DEVICE_CLASS_ICONS[deviceClass];
  const domain = entityId.split(".")[0] ?? "";
  if (/sprinkler|bewaesserung|bewässerung|irrigation/i.test(entityId)) return mdiSprinklerVariant;
  if (/zisterne|cistern|tank/i.test(entityId)) return mdiStorageTankOutline;
  return DOMAIN_ICONS[domain] ?? mdiGauge;
}

const STATE_KEYS: Record<string, TranslationKey> = {
  on: "marker.on",
  off: "marker.off",
  open: "marker.open",
  closed: "marker.closed",
  mowing: "marker.mowing",
  docked: "marker.docked",
  paused: "marker.paused",
  returning: "marker.returning",
  error: "marker.error",
};

/** Short display value: number with unit, translated common states, "–" if unknown. */
export function markerValue(state: HassEntity | undefined, language: string, t: Localize): string {
  if (!state || state.state === "unavailable" || state.state === "unknown") return "–";
  const unit = state.attributes.unit_of_measurement as string | undefined;
  const number = Number(state.state);
  if (state.state.trim() !== "" && Number.isFinite(number)) {
    const text = formatNumber(number, language, 1);
    return unit ? `${text} ${unit}` : text;
  }
  const key = STATE_KEYS[state.state];
  return key ? t(key) : state.state;
}

export function markerName(state: HassEntity | undefined, entityId: string): string {
  return (state?.attributes.friendly_name as string | undefined) ?? entityId;
}
