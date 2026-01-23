import { LitElement, html, css, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { ShotData, XeniaHomeCardConfig, HomeAssistant } from "./types";
import { localize } from "./localize";
import "./xenia-home-card-editor";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
);

const CARD_VERSION = "1.0.0";

console.info(
  `%c XENIA-HOME-CARD %c ${CARD_VERSION} `,
  "color: white; background: #8b4513; font-weight: bold;",
  "color: #8b4513; background: white; font-weight: bold;"
);

@customElement("xenia-home-card")
export class XeniaHomeCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: XeniaHomeCardConfig;
  @state() private _shots: ShotData[] = [];
  @state() private _selectedShot: ShotData | null = null;
  @state() private _loading = true;
  @state() private _error: string | null = null;

  private _chart: Chart | null = null;
  private _unsubscribe: (() => void) | null = null;
  private _shotKeys = new Set<string>();

  static getConfigElement(): HTMLElement {
    return document.createElement("xenia-home-card-editor");
  }

  static getStubConfig(): Partial<XeniaHomeCardConfig> {
    return {
      show_chart: true,
      chart_height: 200,
      max_shots: 10,
    };
  }

  public setConfig(config: XeniaHomeCardConfig): void {
    this._config = {
      show_chart: true,
      chart_height: 200,
      max_shots: 10,
      ...config,
    };
  }

  private _t(key: string): string {
    return localize(key, this.hass?.language);
  }

  private _findXeniaEntity(): string | null {
    if (!this.hass?.states) return null;

    // Look for xenia_home shot tracker entity
    const entityIds = Object.keys(this.hass.states);
    for (const entityId of entityIds) {
      if (
        entityId.startsWith("event.xenia_espresso_machine") ||
        (entityId.startsWith("event.xenia_") && entityId.includes("shot_tracker"))
      ) {
        return entityId;
      }
    }

    return null;
  }

  public getCardSize(): number {
    return this._config?.show_chart ? 5 : 3;
  }

  protected firstUpdated(_changedProps: PropertyValues): void {
    super.firstUpdated(_changedProps);
    this._loadShotHistory();
    this._subscribeToEvents();
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (changedProps.has("_selectedShot") && this._selectedShot) {
      this._updateChart();
    }
    if (changedProps.has("hass") && this.hass) {
      const entityId = this._config?.entity || this._findXeniaEntity();
      if (entityId && this._error) {
        this._error = null;
        this._loadShotHistory();
        this._subscribeToEvents();
      }
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }
  }

  private async _subscribeToEvents(): Promise<void> {
    if (!this.hass) return;

    const eventType = this._config.event_type?.trim();
    if (eventType) {
      try {
        this._unsubscribe = await this.hass.connection.subscribeEvents(
          (event) => {
            const shotData = this._getShotDataFromEvent(event.data);
            if (!shotData) return;
            this._pushShot(shotData);
          },
          eventType
        );
      } catch {
        console.warn("Could not subscribe to shot events");
      }
      return;
    }

    const entityId = this._config.entity || this._findXeniaEntity();
    if (!entityId) return;

    try {
      // Subscribe to state_changed events for the shot tracker entity
      this._unsubscribe = await this.hass.connection.subscribeEvents(
        (event) => {
          const data = event.data as {
            entity_id?: string;
            new_state?: {
              state?: string;
              attributes?: {
                event_type?: string;
                event_data?: ShotData;
              };
            };
          };

          // Check if this is our entity and a shot_completed event
          if (data.entity_id === entityId && data.new_state) {
            const attributes = data.new_state.attributes;
            const eventType =
              attributes?.event_type ?? (data.new_state.state as string);
            const eventData =
              attributes?.event_data ?? (attributes as unknown as ShotData);
            if (eventType === "shot_completed") {
              const shotData = this._normalizeShotData(eventData);
              if (shotData) {
                this._pushShot(shotData);
              }
            }
          }
        },
        "state_changed"
      );
    } catch {
      console.warn("Could not subscribe to shot events");
    }
  }

  private _getShotDataFromEvent(data: Record<string, unknown>): ShotData | null {
    if (!data || typeof data !== "object") return null;
    const payload = data as Record<string, unknown>;

    const eventType = payload.event_type;
    if (typeof eventType === "string" && eventType !== "shot_completed") {
      return null;
    }

    const candidate =
      (payload.event_data as unknown) ??
      (payload.shot as unknown) ??
      (payload.shot_data as unknown) ??
      payload;

    if (this._isShotData(candidate)) {
      return candidate as ShotData;
    }

    return null;
  }

  private _isShotData(value: unknown): value is ShotData {
    if (!value || typeof value !== "object") return false;
    const candidate = value as ShotData;
    return (
      typeof candidate.start_time === "string" &&
      typeof candidate.duration_seconds === "number" &&
      Array.isArray(candidate.timestamps) &&
      Array.isArray(candidate.pump_pressures) &&
      Array.isArray(candidate.flow_rates) &&
      Array.isArray(candidate.weights)
    );
  }

  private _normalizeShotData(data: unknown): ShotData | null {
    if (!data || typeof data !== "object") return null;
    const candidate = data as Partial<ShotData>;
    if (
      typeof candidate.start_time !== "string" ||
      typeof candidate.duration_seconds !== "number"
    ) {
      return null;
    }

    return {
      start_time: candidate.start_time,
      brew_end_time: candidate.brew_end_time ?? null,
      duration_seconds: candidate.duration_seconds,
      afterflow_seconds:
        typeof candidate.afterflow_seconds === "number"
          ? candidate.afterflow_seconds
          : undefined,
      timestamps: Array.isArray(candidate.timestamps) ? candidate.timestamps : [],
      brew_group_temps: Array.isArray(candidate.brew_group_temps)
        ? candidate.brew_group_temps
        : [],
      brew_boiler_temps: Array.isArray(candidate.brew_boiler_temps)
        ? candidate.brew_boiler_temps
        : [],
      pump_pressures: Array.isArray(candidate.pump_pressures)
        ? candidate.pump_pressures
        : [],
      flow_rates: Array.isArray(candidate.flow_rates) ? candidate.flow_rates : [],
      weights: Array.isArray(candidate.weights) ? candidate.weights : [],
    };
  }

  private _pushShot(shotData: ShotData): void {
    const key = this._shotKey(shotData);
    if (this._shotKeys.has(key)) {
      return;
    }
    this._shotKeys.add(key);
    this._shots = [shotData, ...this._shots].slice(0, this._config.max_shots);
    if (!this._selectedShot) {
      this._selectedShot = shotData;
    }
    this.requestUpdate();
  }

  private async _loadShotHistory(): Promise<void> {
    this._loading = true;
    this._error = null;

    try {
      // Auto-detect entity if not configured
      const eventType = this._config.event_type?.trim();
      const entityId = this._config.entity || this._findXeniaEntity();

      if (!entityId || typeof entityId !== "string") {
        if (eventType) {
          this._loading = false;
          return;
        }
        this._error = this._t("card.no_entity");
        this._loading = false;
        return;
      }

      console.debug("Xenia Home Card: Loading history for", entityId);

      // Use Home Assistant's history API to get past events
      const endTime = new Date();
      const startTime = new Date();
      startTime.setDate(startTime.getDate() - 30); // Last 30 days

      interface HistoryState {
        s: string; // state
        a: {       // attributes
          event_type?: string;
          event_data?: ShotData;
        };
        lu: number; // last_updated timestamp
      }

      const history = await this.hass.callWS<Record<string, HistoryState[]>>({
        type: "history/history_during_period",
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        entity_ids: [entityId],
        minimal_response: false,
        significant_changes_only: false,
      });

      if (history && history[entityId]) {
        // Filter for shot_completed events and extract shot data
        const shots = history[entityId]
          .filter(
            (state) =>
              state.a?.event_type === "shot_completed" ||
              state.s === "shot_completed"
          )
          .map((state) => {
            const attributes = state.a;
            const eventData =
              attributes?.event_data ?? (attributes as unknown as ShotData);
            return this._normalizeShotData(eventData);
          })
          .filter((shot): shot is ShotData => Boolean(shot))
          .reverse(); // Most recent first

        this._shots = this._dedupeShots(shots).slice(0, this._config.max_shots);
      }

      if (this._shots.length > 0) {
        this._selectedShot = this._shots[0];
      }
    } catch (err) {
      this._error = `${this._t("card.load_error")}: ${err}`;
      console.error(this._error);
    } finally {
      this._loading = false;
    }
  }

  private _updateChart(): void {
    if (!this._selectedShot || !this._config.show_chart) return;

    const canvas = this.shadowRoot?.querySelector(
      "#shot-chart"
    ) as HTMLCanvasElement;
    if (!canvas) return;

    if (this._chart) {
      this._chart.destroy();
    }

    const shot = this._selectedShot;
    const timePoints = shot.timestamps;
    const pumpPressures = this._buildSeries(timePoints, shot.pump_pressures);
    const flowRates = this._buildSeries(timePoints, shot.flow_rates);
    const weights = this._buildSeries(timePoints, shot.weights);
    const brewGroupTemps = this._buildSeries(
      timePoints,
      shot.brew_group_temps
    );
    const brewBoilerTemps = this._buildSeries(
      timePoints,
      shot.brew_boiler_temps
    );
    const tempRange = this._computeTempRange([
      shot.brew_group_temps,
      shot.brew_boiler_temps,
    ]);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const brewEndTime = this._getBrewEndTime(shot);
    const lastTime =
      shot.timestamps.length > 0 ? shot.timestamps[shot.timestamps.length - 1] : 0;
    const endLinePlugin = {
      id: "shotEndLine",
      afterDraw: (chart: Chart) => {
        if (brewEndTime === null) return;
        const xScale = chart.scales.x;
        const { top, bottom } = chart.chartArea;
        const xEnd = xScale.getPixelForValue(brewEndTime);
        const chartCtx = chart.ctx;

        if (lastTime > brewEndTime + 0.001) {
          const xLast = xScale.getPixelForValue(lastTime);
          chartCtx.save();
          chartCtx.fillStyle = "rgba(52, 152, 219, 0.08)";
          chartCtx.fillRect(xEnd, top, xLast - xEnd, bottom - top);
          chartCtx.restore();
        }

        chartCtx.save();
        chartCtx.strokeStyle = "rgba(0, 0, 0, 0.6)";
        chartCtx.setLineDash([6, 4]);
        chartCtx.lineWidth = 2;
        chartCtx.beginPath();
        chartCtx.moveTo(xEnd, top);
        chartCtx.lineTo(xEnd, bottom);
        chartCtx.stroke();
        chartCtx.restore();
      },
    };

    this._chart = new Chart(ctx, {
      type: "line",
      data: {
        datasets: [
          {
            label: this._t("chart.pressure"),
            data: pumpPressures,
            borderColor: "#e74c3c",
            backgroundColor: "rgba(231, 76, 60, 0.1)",
            yAxisID: "y-pressure",
            tension: 0.3,
            fill: true,
          },
          {
            label: this._t("chart.flow"),
            data: flowRates,
            borderColor: "#3498db",
            backgroundColor: "rgba(52, 152, 219, 0.1)",
            yAxisID: "y-flow",
            tension: 0.3,
            fill: true,
          },
          {
            label: this._t("chart.weight"),
            data: weights,
            borderColor: "#2ecc71",
            backgroundColor: "rgba(46, 204, 113, 0.1)",
            yAxisID: "y-weight",
            tension: 0.3,
            fill: true,
          },
          {
            label: this._t("chart.brew_group_temp"),
            data: brewGroupTemps,
            borderColor: "#f39c12",
            backgroundColor: "rgba(243, 156, 18, 0.1)",
            yAxisID: "y-temp",
            tension: 0.3,
            fill: false,
          },
          {
            label: this._t("chart.brew_boiler_temp"),
            data: brewBoilerTemps,
            borderColor: "#9b59b6",
            backgroundColor: "rgba(155, 89, 182, 0.1)",
            yAxisID: "y-temp",
            tension: 0.3,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: 12,
              padding: 8,
              font: { size: 10 },
            },
          },
          tooltip: {
            backgroundColor: "rgba(0,0,0,0.8)",
            padding: 10,
          },
        },
        scales: {
          x: {
            type: "linear",
            title: { display: true, text: this._t("chart.time"), font: { size: 10 } },
            ticks: { font: { size: 9 }, maxTicksLimit: 10 },
          },
          "y-pressure": {
            type: "linear",
            position: "left",
            min: 0,
            max: 12,
            title: { display: false },
            ticks: { font: { size: 9 }, color: "#e74c3c" },
            grid: { display: false },
          },
          "y-flow": {
            type: "linear",
            position: "right",
            min: 0,
            max: 10,
            title: { display: false },
            ticks: { font: { size: 9 }, color: "#3498db" },
            grid: { display: false },
          },
          "y-weight": {
            type: "linear",
            position: "right",
            min: 0,
            title: { display: false },
            ticks: { font: { size: 9 }, color: "#2ecc71" },
            grid: { display: false },
            display: false,
          },
          "y-temp": {
            type: "linear",
            position: "left",
            suggestedMin: tempRange.min,
            suggestedMax: tempRange.max,
            title: { display: false },
            ticks: { font: { size: 9 }, color: "#f39c12" },
            grid: { display: false },
            display: true,
          },
        },
      },
      plugins: [endLinePlugin],
    });
  }

  private _selectShot(shot: ShotData): void {
    this._selectedShot = shot;
  }

  private _getBrewEndTime(shot: ShotData): number | null {
    if (!shot.timestamps || shot.timestamps.length === 0) return null;
    return shot.duration_seconds;
  }

  private _buildSeries(
    times: number[],
    values: number[]
  ): Array<{ x: number; y: number }> {
    const length = Math.min(times.length, values.length);
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < length; i += 1) {
      points.push({ x: times[i], y: values[i] });
    }
    return points;
  }

  private _computeTempRange(series: number[][]): { min: number; max: number } {
    const values = series.flat().filter((v) => Number.isFinite(v));
    if (values.length === 0) {
      return { min: 40, max: 110 };
    }
    let min = Math.min(...values);
    let max = Math.max(...values);
    const span = Math.max(1, max - min);
    const pad = Math.max(2, span * 0.1);
    min = Math.floor((min - pad) * 2) / 2;
    max = Math.ceil((max + pad) * 2) / 2;
    return { min, max };
  }

  private _formatDate(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  private _formatDuration(seconds: number): string {
    return `${seconds.toFixed(1)}s`;
  }

  private _formatAverage(values: number[], unit: string): string {
    if (!values || values.length === 0) return this._t("details.not_available");
    const sum = values.reduce((acc, val) => acc + val, 0);
    const avg = sum / values.length;
    return `${avg.toFixed(1)}${unit}`;
  }

  private _shotKey(shot: ShotData): string {
    return shot.start_time;
  }

  private _dedupeShots(shots: ShotData[]): ShotData[] {
    const unique: ShotData[] = [];
    const keys = new Set<string>();
    for (const shot of shots) {
      const key = this._shotKey(shot);
      if (keys.has(key)) continue;
      keys.add(key);
      unique.push(shot);
    }
    this._shotKeys = keys;
    return unique;
  }

  protected render(): TemplateResult {
    if (!this._config || !this.hass) {
      return html``;
    }

    return html`
      <ha-card>
        <div class="card-header">
          <span class="title">${this._config.title || this._t("card.default_title")}</span>
          <ha-icon-button
            .path=${"M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"}
            @click=${this._loadShotHistory}
          ></ha-icon-button>
        </div>
        <div class="card-content">
          ${this._loading
            ? html`<div class="loading">${this._t("card.loading")}</div>`
            : this._error
              ? html`<div class="error">${this._error}</div>`
              : this._renderContent()}
        </div>
      </ha-card>
    `;
  }

  private _renderContent(): TemplateResult {
    if (this._shots.length === 0) {
      return html`<div class="empty">${this._t("card.no_shots")}</div>`;
    }

    return html`
      ${this._config.show_chart && this._selectedShot
        ? html`
            <div
              class="chart-container"
              style="height: ${this._config.chart_height}px"
            >
              <canvas id="shot-chart"></canvas>
            </div>
            <div class="shot-details">
              <span class="detail">
                <ha-icon icon="mdi:clock-outline"></ha-icon>
                ${this._formatDuration(this._selectedShot.duration_seconds)}
              </span>
              <span class="detail">
                <ha-icon icon="mdi:thermometer"></ha-icon>
                ${this._t("details.brew_group_short")} ${this._formatAverage(this._selectedShot.brew_group_temps, "°C")}
              </span>
              <span class="detail">
                <ha-icon icon="mdi:thermometer"></ha-icon>
                ${this._t("details.brew_boiler_short")} ${this._formatAverage(this._selectedShot.brew_boiler_temps, "°C")}
              </span>
              <span class="detail">
                <ha-icon icon="mdi:weight-gram"></ha-icon>
                ${this._selectedShot.weights.length > 0
                  ? `${this._selectedShot.weights[this._selectedShot.weights.length - 1].toFixed(1)}g`
                  : this._t("details.not_available")}
              </span>
              <span class="detail">
                <ha-icon icon="mdi:gauge"></ha-icon>
                ${Math.max(...this._selectedShot.pump_pressures).toFixed(1)} bar
              </span>
            </div>
          `
        : ""}

      <div class="shot-list">
        ${this._shots.map(
          (shot) => html`
            <div
              class="shot-item ${this._selectedShot === shot ? "selected" : ""}"
              @click=${() => this._selectShot(shot)}
            >
              <span class="shot-date">${this._formatDate(shot.start_time)}</span>
              <span class="shot-duration"
                >${this._formatDuration(shot.duration_seconds)}</span
              >
              <span class="shot-weight">
                ${shot.weights.length > 0
                  ? `${shot.weights[shot.weights.length - 1].toFixed(1)}g`
                  : ""}
              </span>
            </div>
          `
        )}
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }

    ha-card {
      padding: 0;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--divider-color);
    }

    .title {
      font-size: 1.1em;
      font-weight: 500;
    }

    .card-content {
      padding: 16px;
    }

    .loading,
    .error,
    .empty {
      text-align: center;
      padding: 20px;
      color: var(--secondary-text-color);
    }

    .error {
      color: var(--error-color);
    }

    .chart-container {
      margin-bottom: 16px;
      position: relative;
    }

    .shot-details {
      display: flex;
      justify-content: space-around;
      padding: 12px 0;
      border-bottom: 1px solid var(--divider-color);
      margin-bottom: 12px;
    }

    .detail {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.9em;
    }

    .detail ha-icon {
      --mdc-icon-size: 18px;
      color: var(--secondary-text-color);
    }

    .shot-list {
      max-height: 200px;
      overflow-y: auto;
    }

    .shot-item {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: background-color 0.2s;
      gap: 12px;
    }

    .shot-item:hover {
      background-color: var(--secondary-background-color);
    }

    .shot-item.selected {
      background-color: var(--primary-color);
      color: var(--text-primary-color);
    }

    .shot-date {
      flex: 1;
      font-size: 0.9em;
    }

    .shot-duration {
      font-size: 0.9em;
      color: var(--secondary-text-color);
    }

    .shot-item.selected .shot-duration {
      color: var(--text-primary-color);
      opacity: 0.8;
    }

    .shot-weight {
      font-size: 0.9em;
      min-width: 45px;
      text-align: right;
    }
  `;
}

declare global {
  interface Window {
    customCards: Array<{
      type: string;
      name: string;
      description: string;
      preview: boolean;
    }>;
  }
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "xenia-home-card",
  name: "Xenia Home Card",
  description: "Visualize espresso shots from your Xenia espresso machine",
  preview: true,
});
