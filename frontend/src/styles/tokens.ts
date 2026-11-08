import { css } from "lit";

/**
 * Design tokens. Everything derives from Home Assistant theme variables so that
 * user themes and dark mode apply automatically; the garden palette only adds
 * nature colours that HA themes do not define.
 *
 * Only the panel root includes these styles. Nested elements inherit the custom
 * properties through their shadow roots; redefining them on a nested :host would
 * reset the dark-mode values.
 */
export const tokens = css`
  :host {
    --pg-bg: var(--primary-background-color, #f6f5f1);
    --pg-surface: var(--card-background-color, #ffffff);
    --pg-text: var(--primary-text-color, #1f2a1f);
    --pg-text-muted: var(--secondary-text-color, #5d6b5d);
    --pg-divider: var(--divider-color, rgba(0, 0, 0, 0.12));
    --pg-accent: var(--primary-color, #3f7d4e);
    --pg-radius: var(--ha-card-border-radius, 12px);
    --pg-shadow: var(
      --ha-card-box-shadow,
      0 1px 2px rgba(0, 0, 0, 0.06),
      0 2px 8px rgba(0, 0, 0, 0.06)
    );
    --pg-font: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, system-ui));
    --pg-input-bg: color-mix(in srgb, var(--pg-text) 4%, var(--pg-surface));

    --pg-leaf: #4f8a5b;
    --pg-leaf-soft: #cfe5c2;
    --pg-soil: #8a6a4f;
    --pg-water: #3d8bd9;
    --pg-sun: #f2c14e;
    --pg-sky-top: #e6f2fb;
    --pg-sky-bottom: #f7fbf2;
  }

  :host([dark]) {
    --pg-leaf: #74b382;
    --pg-leaf-soft: #2c4632;
    --pg-soil: #a8896f;
    --pg-water: #6aaef0;
    --pg-sun: #d8a93b;
    --pg-sky-top: #18222c;
    --pg-sky-bottom: #1b241d;
  }
`;
