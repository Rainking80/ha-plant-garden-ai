import { PlantGardenPanel } from "./panel";

// The bundle may be evaluated twice (e.g. after a frontend update without a
// full page reload); defining a custom element twice would throw.
if (!customElements.get("plant-garden-panel")) {
  customElements.define("plant-garden-panel", PlantGardenPanel);
}
