import { mdiDownload, mdiRefresh } from "@mdi/js";
import { css, html, nothing, svg } from "lit";

import {
  errorMessage,
  getPricing,
  setPrice,
  techInfo,
  testProvider,
  usageLog,
  usageSummary,
} from "../api/client";
import type {
  PricingInfo,
  Prices,
  TechInfo,
  UsageRow,
  UsageSummary,
  UsageTotals,
} from "../api/types";
import { PgElement, define, icon } from "../components/base";
import type { GardenStore } from "../state/garden-store";
import { shared } from "../styles/shared";
import { formatBytes, formatDateTime, formatMoney, formatNumber } from "../util/format";

const LOG_PAGE = 100;
const PRICE_KEYS = [
  "input",
  "cached_input",
  "cache_write",
  "output",
  "per_image",
  "per_request",
] as const;
const CHART_W = 600;
const CHART_H = 110;
const COLORS = ["#2e7d32", "#1565c0", "#ef6c00", "#6a1b9a", "#00838f", "#c62828", "#827717"];

/** CSV of log rows (comma separated, quoted where needed). */
export function toCsv(rows: UsageRow[]): string {
  const columns: (keyof UsageRow)[] = [
    "ts", "feature", "provider_title", "model", "plant_id", "status", "error", "input",
    "cached_input", "cache_write", "output", "reasoning", "images", "cost", "cost_source",
    "latency_ms",
  ]; // prettier-ignore
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.join(","), ...rows.map((row) => columns.map((c) => cell(row[c])).join(","))].join(
    "\n",
  );
}

/** Stacked cost bars per day and model for the last days. */
export function costBars(
  daily: UsageSummary["daily"],
  width: number,
  height: number,
): {
  days: string[];
  models: string[];
  bars: { x: number; y: number; w: number; h: number; model: string; day: string; cost: number }[];
} {
  const days = [...new Set(daily.map((d) => d.day))].sort();
  const models = [...new Set(daily.map((d) => d.model))];
  const totals = days.map((day) =>
    daily.filter((d) => d.day === day).reduce((sum, d) => sum + (d.cost ?? 0), 0),
  );
  const top = Math.max(...totals, 0.01);
  const slot = days.length ? width / days.length : width;
  const bars = [];
  for (const [i, day] of days.entries()) {
    let y = height;
    for (const entry of daily.filter((d) => d.day === day && (d.cost ?? 0) > 0)) {
      const h = ((entry.cost ?? 0) / top) * height;
      y -= h;
      bars.push({
        x: i * slot + slot * 0.15,
        y,
        w: slot * 0.7,
        h,
        model: entry.model,
        day,
        cost: entry.cost ?? 0,
      });
    }
  }
  return { days, models, bars };
}

/** Requests, tokens and costs of all AI calls; providers, prices and system data (admins). */
export class PgTechView extends PgElement {
  static override properties = {
    store: { attribute: false },
    _summary: { state: true },
    _rows: { state: true },
    _pricing: { state: true },
    _info: { state: true },
    _feature: { state: true },
    _status: { state: true },
    _error: { state: true },
    _testing: { state: true },
  };

  declare store: GardenStore;
  declare _summary: UsageSummary | null;
  declare _rows: UsageRow[];
  declare _pricing: PricingInfo | null;
  declare _info: TechInfo | null;
  declare _feature: string;
  declare _status: string;
  declare _error: string;
  declare _testing: string;

  constructor() {
    super();
    this._summary = null;
    this._rows = [];
    this._pricing = null;
    this._info = null;
    this._feature = "";
    this._status = "";
    this._error = "";
    this._testing = "";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void this._load();
  }

  private async _load(): Promise<void> {
    try {
      const [summary, rows, pricing, info] = await Promise.all([
        usageSummary(this.hass),
        this._fetchLog(0),
        getPricing(this.hass),
        techInfo(this.hass),
      ]);
      this._summary = summary;
      this._rows = rows;
      this._pricing = pricing;
      this._info = info;
      this._error = "";
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private _fetchLog(offset: number): Promise<UsageRow[]> {
    return usageLog(this.hass, {
      limit: LOG_PAGE,
      offset,
      ...(this._feature ? { feature: this._feature } : {}),
      ...(this._status ? { status: this._status } : {}),
    });
  }

  private async _reloadLog(): Promise<void> {
    try {
      this._rows = await this._fetchLog(0);
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private async _more(): Promise<void> {
    this._rows = [...this._rows, ...(await this._fetchLog(this._rows.length))];
  }

  private _download(): void {
    const blob = new Blob([toCsv(this._rows)], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "plant-garden-ai-log.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  private async _test(id: string): Promise<void> {
    this._testing = id;
    try {
      await testProvider(this.hass, id);
      this._info = await techInfo(this.hass);
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._testing = "";
    }
  }

  private async _savePrice(kind: string, model: string, form: HTMLElement): Promise<void> {
    const prices: Prices = {};
    for (const input of form.querySelectorAll<HTMLInputElement>("input[data-key]")) {
      const raw = input.value.replace(",", ".").trim();
      if (raw !== "") prices[input.dataset.key as keyof Prices] = Number(raw);
    }
    try {
      this._pricing = await setPrice(this.hass, kind, model, prices);
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private async _resetPrice(kind: string, model: string): Promise<void> {
    this._pricing = await setPrice(this.hass, kind, model, null);
  }

  private _money(usd: number | null | undefined): string {
    if (usd === null || usd === undefined) return this.t("tech.unknown");
    const value = usd * (this._summary?.rate ?? 1);
    return formatMoney(value, this._summary?.currency ?? "USD", this.language);
  }

  private _tokens(totals: UsageTotals): number {
    return totals.input + totals.cached_input + totals.cache_write + totals.output;
  }

  protected override render() {
    const { t } = this;
    const summary = this._summary;
    return html`
      <div class="toolbar">
        <h2>${t("tech.title")}</h2>
        <button class="button text" @click=${this._load}>
          ${icon(mdiRefresh)} ${t("weather.refresh")}
        </button>
      </div>
      ${this._error ? html`<p class="error-text" role="alert">${this._error}</p>` : nothing}
      ${summary ? this._renderTotals(summary) : nothing}
      ${summary ? this._renderChart(summary) : nothing}
      ${summary ? this._renderBreakdown(summary) : nothing} ${this._renderLog()}
      ${this._info ? this._renderProviders(this._info) : nothing}
      ${this._pricing ? this._renderPricing(this._pricing) : nothing}
      ${this._info ? this._renderSystem(this._info) : nothing}
    `;
  }

  private _renderTotals(summary: UsageSummary) {
    const { t, language } = this;
    const card = (label: string, totals: UsageTotals) =>
      html`<div class="kpi">
        <h4>${label}</h4>
        <p class="big">${this._money(totals.requests ? totals.cost : 0)}</p>
        <p class="small">
          ${t("tech.requests", { n: totals.requests })} ·
          ${t("tech.tokens", { n: formatNumber(this._tokens(totals), language, 0) })}
        </p>
        <p class="small muted">
          ${t("tech.detail", {
            input: formatNumber(totals.input, language, 0),
            cached: formatNumber(totals.cached_input + totals.cache_write, language, 0),
            output: formatNumber(totals.output, language, 0),
            images: totals.images,
          })}
        </p>
        <p class="small muted">
          ${t("tech.quality", {
            errors: totals.requests ? Math.round((totals.errors / totals.requests) * 100) : 0,
            latency: totals.requests
              ? formatNumber(totals.latency_ms / totals.requests / 1000, language, 1)
              : 0,
          })}
          ${totals.unknown_cost ? ` · ${t("tech.unknown_calls", { n: totals.unknown_cost })}` : ""}
        </p>
      </div>`;
    const spent = (summary.month.cost ?? 0) * summary.rate;
    return html`<section class="card block">
      <div class="kpis">
        ${card(t("tech.today"), summary.today)} ${card(t("tech.month"), summary.month)}
        ${card(t("tech.total"), summary.total)}
      </div>
      ${
        summary.budget > 0
          ? html`<div class="budget">
              <span class="small">
                ${t("tech.budget", {
                  spent: formatMoney(spent, summary.currency, language),
                  budget: formatMoney(summary.budget, summary.currency, language),
                })}
                ${summary.budget_stop ? ` · ${t("tech.budget_stop")}` : ""}
              </span>
              <div class="meter">
                <span style="width: ${Math.min(100, (spent / summary.budget) * 100)}%"></span>
              </div>
            </div>`
          : nothing
      }
    </section>`;
  }

  private _renderChart(summary: UsageSummary) {
    const { t } = this;
    const chart = costBars(summary.daily, CHART_W, CHART_H);
    if (!chart.bars.length) return nothing;
    const color = (model: string) => COLORS[chart.models.indexOf(model) % COLORS.length];
    return html`<section class="card block">
      <h3>${t("tech.per_day")}</h3>
      <svg
        class="chart"
        viewBox="0 0 ${CHART_W} ${CHART_H}"
        preserveAspectRatio="none"
        role="img"
        aria-label=${t("tech.per_day")}
      >
        ${chart.bars.map(
          (
            bar,
          ) => svg`<rect x=${bar.x} y=${bar.y} width=${bar.w} height=${bar.h} fill=${color(bar.model)}>
            <title>${bar.day} · ${bar.model}: ${this._money(bar.cost)}</title></rect>`,
        )}
      </svg>
      <p class="legend small">
        ${chart.models.map((m) => html`<span><i style="background: ${color(m)}"></i>${m}</span>`)}
      </p>
    </section>`;
  }

  private _renderBreakdown(summary: UsageSummary) {
    const { t } = this;
    if (!summary.month.requests) return nothing;
    const name = (column: string, key: string) =>
      column === "plant_id"
        ? (this.store?.getPlant(key)?.name ?? key)
        : column === "feature"
          ? t(`feature.${key}` as "feature.identify")
          : key;
    return html`<section class="card block">
      <h3>${t("tech.breakdown")}</h3>
      <div class="tables">
        ${(["provider", "model", "feature", "plant_id"] as const).map(
          (column) =>
            html`<table>
              <thead>
                <tr>
                  <th>${t(`tech.by_${column}`)}</th>
                  <th>${t("tech.col_requests")}</th>
                  <th>${t("tech.col_cost")}</th>
                </tr>
              </thead>
              <tbody>
                ${summary.by[column].map(
                  (row) =>
                    html`<tr>
                      <td>${name(column, row.key)}</td>
                      <td>${row.requests}</td>
                      <td>${this._money(row.cost)}</td>
                    </tr>`,
                )}
              </tbody>
            </table>`,
        )}
      </div>
    </section>`;
  }

  private _renderLog() {
    const { t, language } = this;
    return html`<section class="card block">
      <div class="toolbar">
        <h3>${t("tech.log")}</h3>
        <div class="filters">
          <select
            aria-label=${t("tech.filter_feature")}
            @change=${(e: Event) => {
              this._feature = (e.target as HTMLSelectElement).value;
              void this._reloadLog();
            }}
          >
            <option value="">${t("tech.all_features")}</option>
            ${["identify", "estimate", "diagnose", "tips", "chat", "digest"].map(
              (f) => html`<option value=${f}>${t(`feature.${f}` as "feature.identify")}</option>`,
            )}
          </select>
          <select
            aria-label=${t("tech.filter_status")}
            @change=${(e: Event) => {
              this._status = (e.target as HTMLSelectElement).value;
              void this._reloadLog();
            }}
          >
            <option value="">${t("tech.all_status")}</option>
            <option value="ok">ok</option>
            <option value="error">error</option>
            <option value="invalid_json">invalid_json</option>
          </select>
          <button class="button text" ?disabled=${!this._rows.length} @click=${this._download}>
            ${icon(mdiDownload)} CSV
          </button>
        </div>
      </div>
      ${
        this._rows.length
          ? html`<div class="scroll">
                <table class="log">
                  <thead>
                    <tr>
                      <th>${t("tech.col_time")}</th>
                      <th>${t("tech.col_feature")}</th>
                      <th>${t("tech.col_model")}</th>
                      <th>${t("tech.col_tokens")}</th>
                      <th>${t("tech.col_cost")}</th>
                      <th>${t("tech.col_latency")}</th>
                      <th>${t("tech.col_status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${this._rows.map(
                      (row) =>
                        html`<tr class=${row.status === "ok" ? "" : "failed"}>
                          <td>${formatDateTime(row.ts, language)}</td>
                          <td>${t(`feature.${row.feature}` as "feature.identify")}</td>
                          <td>
                            ${row.provider_title}<br /><span class="muted small">${row.model}</span>
                          </td>
                          <td class="num">
                            ${formatNumber(row.input + row.cached_input + row.cache_write, language, 0)}
                            /
                            ${formatNumber(row.output, language, 0)}${row.images ? ` · ${row.images} 🖼` : ""}
                          </td>
                          <td class="num">
                            ${this._money(row.cost)}${row.cost_source === "provider" ? " *" : ""}
                          </td>
                          <td class="num">${formatNumber(row.latency_ms / 1000, language, 1)} s</td>
                          <td>
                            ${row.status}${row.error ? html`<br /><span class="muted small">${row.error}</span>` : nothing}
                          </td>
                        </tr>`,
                    )}
                  </tbody>
                </table>
              </div>
              ${this._rows.length % LOG_PAGE === 0 ? html`<button class="button text" @click=${this._more}>${t("tech.more")}</button>` : nothing}
              <p class="muted small">${t("tech.log_hint")}</p>`
          : html`<p class="muted">${t("tech.no_calls")}</p>`
      }
    </section>`;
  }

  private _renderProviders(info: TechInfo) {
    const { t, language } = this;
    return html`<section class="card block">
      <h3>${t("tech.providers")}</h3>
      ${
        info.providers.length
          ? html`<ul class="providers">
              ${info.providers.map(
                (p) =>
                  html`<li>
                    <div>
                      <strong>${p.title}</strong>
                      <span class="muted small"
                        >${[p.model, p.key].filter(Boolean).join(" · ")}</span
                      >
                      ${
                        p.status
                          ? html`<span class="small ${p.status.ok ? "" : "error-text"}">
                              ${p.status.ok ? t("tech.ok") : (p.status.error ?? "")} ·
                              ${formatDateTime(p.status.checked, language)}
                              ${p.status.remaining !== undefined && p.status.remaining !== null ? ` · ${t("tech.remaining", { n: p.status.remaining })}` : ""}
                            </span>`
                          : nothing
                      }
                    </div>
                    <button
                      class="button text"
                      ?disabled=${this._testing === p.id}
                      @click=${() => this._test(p.id)}
                    >
                      ${t("tech.test")}
                    </button>
                  </li>`,
              )}
            </ul>`
          : html`<p class="muted">${t("ai.setup")}</p>`
      }
    </section>`;
  }

  private _renderPricing(pricing: PricingInfo) {
    const { t } = this;
    return html`<section class="card block">
      <h3>${t("tech.pricing")}</h3>
      <p class="muted small">
        ${t("tech.pricing_hint", { date: pricing.as_of, currency: pricing.currency })}
      </p>
      ${Object.entries(pricing.prices)
        .filter(([, models]) => Object.keys(models).length)
        .map(
          ([kind, models]) =>
            html`<details>
              <summary>${kind}</summary>
              <p class="muted small">${pricing.sources[kind] ?? ""}</p>
              <div class="scroll">
                <table class="prices">
                  <thead>
                    <tr>
                      <th>${t("tech.col_model")}</th>
                      ${PRICE_KEYS.map((k) => html`<th>${t(`price.${k}`)}</th>`)}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${Object.entries(models).map(
                      ([model, prices]) =>
                        html`<tr>
                          <td>
                            ${model}${pricing.overrides[kind]?.[model] ? html` <span class="muted small">(${t("tech.own_price")})</span>` : nothing}
                          </td>
                          ${PRICE_KEYS.map(
                            (key) =>
                              html`<td>
                                <input
                                  data-key=${key}
                                  inputmode="decimal"
                                  .value=${prices[key] === undefined ? "" : String(prices[key])}
                                />
                              </td>`,
                          )}
                          <td class="row-actions">
                            <button
                              class="button text"
                              @click=${(e: Event) => this._savePrice(kind, model, (e.target as HTMLElement).closest("tr") as HTMLElement)}
                            >
                              ${t("common.save")}
                            </button>
                            ${pricing.overrides[kind]?.[model] ? html`<button class="button text" @click=${() => this._resetPrice(kind, model)}>${t("tech.reset")}</button>` : nothing}
                          </td>
                        </tr>`,
                    )}
                  </tbody>
                </table>
              </div>
            </details>`,
        )}
    </section>`;
  }

  private _renderSystem(info: TechInfo) {
    const { t, language } = this;
    const storage = info.storage;
    return html`<section class="card block">
      <h3>${t("tech.system")}</h3>
      <dl class="system">
        <dt>${t("tech.version")}</dt>
        <dd>${info.version}</dd>
        <dt>${t("tech.storage")}</dt>
        <dd>
          ${t("tech.storage_detail", {
            photos: formatBytes(storage.photos ?? 0, language),
            backgrounds: formatBytes(storage.backgrounds ?? 0, language),
            database: formatBytes(storage.database ?? 0, language),
          })}
        </dd>
        <dt>${t("tech.entities")}</dt>
        <dd>${info.entities} · ${t("tech.plants", { n: info.plants })}</dd>
        <dt>${t("weather.sources")}</dt>
        <dd>
          ${
            info.weather.sources.length
              ? html`${info.weather.sources.map((s) => html`${s.title}: ${s.ok ? t("weather.source_days", { days: s.days }) : (s.error ?? "")}<br />`)}
                ${info.weather.updated ? t("weather.updated", { time: formatDateTime(info.weather.updated, language) }) : t("tech.never")}`
              : t("tech.no_weather")
          }
          ${info.weather.last_error ? html`<br /><span class="error-text">${info.weather.last_error}</span>` : nothing}
        </dd>
      </dl>
    </section>`;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: grid;
        gap: 16px;
      }
      .block {
        padding: 16px;
        min-width: 0;
      }
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
      }
      h2,
      h3 {
        margin: 0 0 8px;
      }
      .kpis {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }
      .kpi h4 {
        margin: 0;
        color: var(--pg-text-muted);
        font-weight: 500;
      }
      .kpi p {
        margin: 2px 0;
      }
      .big {
        font-size: 24px;
        font-weight: 600;
      }
      .budget {
        margin-top: 12px;
      }
      .meter {
        height: 8px;
        border-radius: 4px;
        background: color-mix(in srgb, var(--pg-text) 10%, transparent);
        overflow: hidden;
      }
      .meter span {
        display: block;
        height: 100%;
        background: var(--pg-accent);
      }
      .chart {
        width: 100%;
        height: 120px;
        display: block;
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 12px;
      }
      .legend i {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 2px;
        margin-right: 4px;
      }
      .tables {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      th,
      td {
        text-align: left;
        padding: 4px 6px;
        border-bottom: 1px solid var(--pg-divider);
        vertical-align: top;
      }
      .num {
        text-align: right;
        white-space: nowrap;
      }
      .scroll {
        overflow-x: auto;
      }
      .log tr.failed td {
        color: var(--error-color, #db4437);
      }
      .filters {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .filters select {
        width: auto;
      }
      .providers {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 8px;
      }
      .providers li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .providers li div {
        display: grid;
      }
      .prices input {
        width: 70px;
        min-height: 30px;
        padding: 2px 6px;
      }
      .row-actions {
        white-space: nowrap;
      }
      details {
        margin: 8px 0;
      }
      summary {
        cursor: pointer;
        font-weight: 500;
      }
      .system {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 4px 16px;
        margin: 0;
      }
      .system dt {
        color: var(--pg-text-muted);
      }
      .system dd {
        margin: 0;
      }
    `,
  ];
}

define("pg-tech-view", PgTechView);
