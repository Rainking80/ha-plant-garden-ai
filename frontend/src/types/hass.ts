import type {
  Connection,
  HassConfig,
  HassEntities,
  MessageBase,
} from "home-assistant-js-websocket";

/**
 * The subset of Home Assistant's frontend `hass` object that the panel uses.
 * Home Assistant passes a new object on every state change.
 */
export interface HomeAssistant {
  connection: Connection;
  states: HassEntities;
  config: HassConfig;
  language: string;
  locale: { language: string };
  themes: { darkMode: boolean };
  user?: { id: string; name: string; is_admin: boolean };
  auth: { data: { access_token: string } };
  callWS<T>(msg: MessageBase): Promise<T>;
}

/** The `panel` property Home Assistant hands to a custom panel element. */
export interface PanelInfo<C extends object = Record<string, unknown>> {
  component_name: string;
  config: C;
  icon: string | null;
  title: string | null;
  url_path: string;
}

/** Config the backend passes in `panel_custom.async_register_panel(config=...)`. */
export interface PlantGardenPanelConfig {
  entry_id: string;
}
