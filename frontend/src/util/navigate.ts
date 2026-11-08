/**
 * Navigate inside Home Assistant without a page reload. HA listens for
 * "location-changed" on window and then hands the panel a new `route`.
 */
export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (options.replace) {
    history.replaceState(history.state, "", path);
  } else {
    history.pushState(null, "", path);
  }
  window.dispatchEvent(
    new CustomEvent("location-changed", { detail: { replace: Boolean(options.replace) } }),
  );
}
