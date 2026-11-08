import type { Localize } from "../i18n";

/** Parse "YYYY-MM-DD" as a local date (new Date("2026-06-01") would be UTC midnight). */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Today as "YYYY-MM-DD" in the browser's time zone. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatDate(iso: string | null | undefined, language: string): string {
  if (!iso) return "";
  const date = iso.length === 10 ? parseLocalDate(iso) : new Date(iso);
  return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(date);
}

export function formatMonth(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(
    new Date(iso),
  );
}

/** "YYYY-MM" of an ISO datetime in the browser's time zone, for grouping. */
export function monthKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatNumber(value: number, language: string, digits = 1): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);
}

/** Centimetres, switching to metres from 1 m. */
export function formatLength(cm: number | null | undefined, language: string): string {
  if (cm === null || cm === undefined) return "";
  return cm >= 100
    ? `${formatNumber(cm / 100, language, 2)} m`
    : `${formatNumber(cm, language)} cm`;
}

export function formatAge(months: number | null | undefined, t: Localize): string {
  if (months === null || months === undefined) return "";
  if (months < 1) return t("age.under_month");
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years) parts.push(t(years === 1 ? "age.year_one" : "age.year_other", { n: years }));
  if (rest) parts.push(t(rest === 1 ? "age.month_one" : "age.month_other", { n: rest }));
  return parts.join(", ");
}

export function formatBytes(bytes: number, language: string): string {
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, language, 0)} KB`;
  return `${formatNumber(bytes / 1024 / 1024, language, 1)} MB`;
}

/** Date and time of a timestamp, e.g. "8. Nov., 06:30" (today: only the time). */
export function formatDateTime(iso: string, language: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return time;
  const day = date.toLocaleDateString(language, { day: "numeric", month: "short" });
  return `${day}, ${time}`;
}

/** Litres with a sensible precision: 0.35 L, 4.2 L, 120 L. */
export function formatLiters(liters: number, language: string): string {
  const digits = liters < 1 ? 2 : liters < 10 ? 1 : 0;
  return `${formatNumber(liters, language, digits)} L`;
}
