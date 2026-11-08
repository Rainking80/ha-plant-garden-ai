/**
 * Official aerial imagery (digital orthophotos, DOP) via WMS, and conversions
 * between plan metres and geographic coordinates.
 *
 * Every preset was checked on 2026-11-08: GetCapabilities lists the layer, a
 * GetMap request in EPSG:3857 returns an image, and the attribution follows the
 * licence text in the capabilities. Saxony (licence only behind a generic terms
 * page) and Saxony-Anhalt (no licence stated) are not included; users can add
 * any WMS themselves.
 */
import type { Point, WmsBackground } from "../api/types";
import type { Bounds } from "./geometry";

export interface GeoOrigin {
  latitude: number;
  longitude: number;
}

export interface WmsPreset {
  key: string;
  name: string;
  url: string;
  layers: string;
  /** "{year}" is replaced by the current year (licences that ask for the year of retrieval). */
  attribution: string;
  /** west, south, east, north in degrees */
  bbox: [number, number, number, number];
}

export const WMS_PRESETS: WmsPreset[] = [
  {
    key: "bb",
    name: "Berlin/Brandenburg (DOP20)",
    url: "https://isk.geobasis-bb.de/mapproxy/dop20c/service/wms",
    layers: "bebb_dop20c",
    attribution: "© GeoBasis-DE/LGB, © Geoportal Berlin, dl-de/by-2-0",
    bbox: [11.229, 51.306, 14.77, 53.573],
  },
  {
    key: "by",
    name: "Bayern (DOP20)",
    url: "https://geoservices.bayern.de/od/wms/dop/v1/dop20",
    layers: "by_dop20c",
    attribution: "© Bayerische Vermessungsverwaltung, CC BY 4.0",
    bbox: [8.958, 47.163, 14.033, 50.588],
  },
  {
    key: "bw",
    name: "Baden-Württemberg (DOP20)",
    url: "https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ATKIS_DOP_20_C",
    layers: "IMAGES_DOP_20_RGB",
    attribution:
      "LGL-BW ({year}) Datenlizenz Deutschland – Namensnennung – Version 2.0, www.lgl-bw.de",
    bbox: [7.5, 47.5, 10.5, 49.8],
  },
  {
    key: "hb",
    name: "Bremen (DOP20)",
    url: "https://geodienste.bremen.de/wms_dop20_2023",
    layers: "DOP20_2023_HB,DOP20_2023_BHV",
    attribution: "© Landesamt GeoInformation Bremen, CC BY",
    bbox: [8.46, 53.006, 9.014, 53.613],
  },
  {
    key: "he",
    name: "Hessen (DOP)",
    url: "https://www.gds-srv.hessen.de/cgi-bin/lika-services/ogc-free-images.ows",
    layers: "he_dop_rgb",
    attribution: "Geobasisdaten © HVBG",
    bbox: [7.419, 49.25, 10.5, 51.76],
  },
  {
    key: "mv",
    name: "Mecklenburg-Vorpommern (DOP)",
    url: "https://www.geodaten-mv.de/dienste/adv_dop",
    layers: "mv_dop",
    attribution: "© GeoBasis-DE/M-V {year}",
    bbox: [10.339, 53.039, 14.477, 54.821],
  },
  {
    key: "ni",
    name: "Niedersachsen (DOP20)",
    url: "https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms",
    layers: "ni_dop20",
    attribution: "© LGLN ({year}), CC BY 4.0",
    bbox: [6.506, 51.153, 11.754, 54.148],
  },
  {
    key: "nw",
    name: "Nordrhein-Westfalen (DOP)",
    url: "https://www.wms.nrw.de/geobasis/wms_nw_dop",
    layers: "nw_dop_rgb",
    attribution: "© Geobasis NRW, dl-de/zero-2-0",
    bbox: [5.593, 50.058, 9.742, 52.8],
  },
  {
    key: "rp",
    name: "Rheinland-Pfalz (DOP20)",
    url: "https://geo4.service24.rlp.de/wms/rp_dop20.fcgi",
    layers: "rp_dop20",
    attribution: "© GeoBasis-DE / LVermGeoRP ({year}), dl-de/by-2-0, www.lvermgeo.rlp.de",
    bbox: [6.038, 48.898, 8.618, 51.001],
  },
  {
    key: "sl",
    name: "Saarland (DOP20)",
    url: "https://geoportal.saarland.de/freewms/dop2023",
    layers: "sl_dop20_rgb",
    attribution: "© LVGL Saarland",
    bbox: [6.341, 49.083, 7.438, 49.66],
  },
  {
    key: "sh",
    name: "Schleswig-Holstein (DOP20)",
    url: "https://service.gdi-sh.de/WMS_SH_DOP20col_OpenGBD",
    layers: "sh_dop20_rgb",
    attribution: "© GeoBasis-DE/LVermGeo SH/CC BY 4.0",
    bbox: [7.823, 53.299, 11.416, 55.154],
  },
  {
    key: "th",
    name: "Thüringen (DOP)",
    url: "https://www.geoproxy.geoportal-th.de/geoproxy/services/DOP",
    layers: "th_dop",
    attribution: "© GDI-Th, CC BY 4.0",
    bbox: [9.855, 50.154, 12.712, 51.664],
  },
];

export type { Background, ImageBackground, WmsBackground } from "../api/types";

/** The preset whose area contains the origin; smaller areas win near borders. */
export function presetFor(origin: GeoOrigin | null): WmsPreset | undefined {
  if (!origin) return undefined;
  const area = (p: WmsPreset) => (p.bbox[2] - p.bbox[0]) * (p.bbox[3] - p.bbox[1]);
  return [...WMS_PRESETS]
    .sort((a, b) => area(a) - area(b))
    .find(
      ({ bbox: [w, s, e, n] }) =>
        origin.longitude >= w &&
        origin.longitude <= e &&
        origin.latitude >= s &&
        origin.latitude <= n,
    );
}

/** URL, layers and attribution of a WMS background (preset or own service). */
export function resolveWms(
  background: WmsBackground,
  year = new Date().getFullYear(),
): { url: string; layers: string; attribution: string } | null {
  const preset = WMS_PRESETS.find((p) => p.key === background.preset);
  const url = preset?.url ?? background.url;
  const layers = preset?.layers ?? background.layers;
  if (!url || !layers) return null;
  const attribution = (preset?.attribution ?? background.attribution ?? "").replace(
    "{year}",
    String(year),
  );
  return { url, layers, attribution };
}

const R = 6378137;
const RAD = Math.PI / 180;

/** Web Mercator (EPSG:3857) metres of a geographic position. */
export function toMercator(lat: number, lon: number): { mx: number; my: number } {
  return { mx: R * lon * RAD, my: R * Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2)) };
}

/**
 * Plan metres -> EPSG:3857. Web Mercator stretches distances by 1/cos(latitude);
 * within a garden that factor is constant.
 */
export function planToMercator(origin: GeoOrigin, p: Point): { mx: number; my: number } {
  const o = toMercator(origin.latitude, origin.longitude);
  const k = 1 / Math.cos(origin.latitude * RAD);
  return { mx: o.mx + p.x * k, my: o.my - p.y * k };
}

/** Geographic position (e.g. photo GPS) -> plan metres. */
export function geoToPlan(origin: GeoOrigin, lat: number, lon: number): Point {
  const o = toMercator(origin.latitude, origin.longitude);
  const m = toMercator(lat, lon);
  const k = 1 / Math.cos(origin.latitude * RAD);
  return { x: (m.mx - o.mx) / k, y: -(m.my - o.my) / k };
}

export const MAX_WMS_PX = 2048;
const FINEST_M_PER_PX = 0.1; // DOP20 has 20 cm pixels; finer requests only cost bandwidth

/**
 * GetMap request for an area of the plan. The returned pixel size keeps the
 * aspect ratio of `bounds`, so the image can be stretched onto it 1:1.
 */
export function getMapRequest(
  wms: { url: string; layers: string },
  origin: GeoOrigin,
  bounds: Bounds,
  screenWidthPx: number,
): { href: string; widthPx: number; heightPx: number } {
  const wM = bounds.maxX - bounds.minX;
  const hM = bounds.maxY - bounds.minY;
  let widthPx = Math.min(MAX_WMS_PX, Math.ceil(screenWidthPx), Math.ceil(wM / FINEST_M_PER_PX));
  let heightPx = Math.round((widthPx * hM) / wM);
  if (heightPx > MAX_WMS_PX) {
    heightPx = MAX_WMS_PX;
    widthPx = Math.round((heightPx * wM) / hM);
  }
  const sw = planToMercator(origin, { x: bounds.minX, y: bounds.maxY });
  const ne = planToMercator(origin, { x: bounds.maxX, y: bounds.minY });
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: wms.layers,
    STYLES: "",
    CRS: "EPSG:3857",
    BBOX: [sw.mx, sw.my, ne.mx, ne.my].map((v) => v.toFixed(2)).join(","),
    WIDTH: String(Math.max(1, widthPx)),
    HEIGHT: String(Math.max(1, heightPx)),
    FORMAT: "image/jpeg",
  });
  const separator = wms.url.includes("?") ? "&" : "?";
  return { href: `${wms.url}${separator}${params.toString()}`, widthPx, heightPx };
}
