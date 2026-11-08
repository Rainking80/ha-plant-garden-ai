export const en = {
  "panel.open_sidebar": "Open sidebar",
  "panel.loading": "Loading your garden…",
  "panel.error_title": "Plant Garden is not reachable",
  "panel.error_hint": "Check the Home Assistant log for messages from plant_garden.",
  "panel.retry": "Try again",
  "welcome.title": "Welcome to {garden}",
  "welcome.lead":
    "Plant Garden is being set up. Soon you will draw your garden here, place plants and irrigation zones and keep an eye on water and plant health.",
  "feature.plan.title": "Garden plan",
  "feature.plan.body": "Draw the layout and drag plants and irrigation zones into place.",
  "feature.plants.title": "Plants & photos",
  "feature.plants.body": "Document growth and problems with photos for every plant.",
  "feature.water.title": "Water balance",
  "feature.water.body": "Rain, evaporation and irrigation per plant, calculated daily.",
  "feature.ai.title": "AI assistant",
  "feature.ai.body": "Identification, diagnosis and tips with your own API key.",
  "feature.coming": "In progress",
  "meta.version": "Version {version}",
  "meta.connected": "Connected to Home Assistant",
} as const;

export type TranslationKey = keyof typeof en;
export type Translations = Record<TranslationKey, string>;
