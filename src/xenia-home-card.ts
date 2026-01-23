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

  static getConfigElement(): HTMLElement {
    return document.createElement("xenia-home-card-editor");
  }

  static getStubConfig(): Partial<XeniaHomeCardConfig> {
    return {
      title: "Espresso Shots",
      show_chart: true,
      chart_height: 200,
      max_shots: 10,
    };
  }

  public setConfig(config: XeniaHomeCardConfig): void {
    this._config = {
      title: "Espresso Shots",
      show_chart: true,
      chart_height: 200,
      max_shots: 10,
      ...config,
    };
  }

  private _findXeniaEntity(): string | null {
    if (!this.hass?.states) return null;

    // Look for xenia_home shot tracker entity
    const entityIds = Object.keys(this.hass.states);
    for (const entityId of entityIds) {
      console.debug("testing:" entityId)
      if (entityId.startsWith("event.xenia_espresso_machine")) {
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

    const entityId = this._config.entity || this._findXeniaEntity();
    if (!entityId) return;

    try {
      // Subscribe to state_changed events for the shot tracker entity
      this._unsubscribe = await this.hass.connection.subscribeEvents(
        (event) => {
          const data = event.data as {
            entity_id?: string;
            new_state?: {
              attributes?: {
                event_type?: string;
                event_data?: ShotData;
              };
            };
          };

          // Check if this is our entity and a shot_completed event
          if (
            data.entity_id === entityId &&
            data.new_state?.attributes?.event_type === "shot_completed" &&
            data.new_state?.attributes?.event_data
          ) {
            const shotData = data.new_state.attributes.event_data;
            this._shots = [shotData, ...this._shots].slice(
              0,
              this._config.max_shots
            );
            if (!this._selectedShot) {
              this._selectedShot = shotData;
            }
            this.requestUpdate();
          }
        },
        "state_changed"
      );
    } catch {
      console.warn("Could not subscribe to shot events");
    }
  }

  private async _loadShotHistory(): Promise<void> {
    this._loading = true;
    this._error = null;

    try {
      // Auto-detect entity if not configured
      const entityId = this._config.entity || this._findXeniaEntity();
      console.debug(entityId)

      if (!entityId || typeof entityId !== "string") {
        this._error = "No Xenia device found";
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
              state.a?.event_type === "shot_completed" &&
              state.a?.event_data
          )
          .map((state) => state.a.event_data as ShotData)
          .reverse() // Most recent first
          .slice(0, this._config.max_shots);

        this._shots = shots;
      }

      if (this._shots.length > 0) {
        this._selectedShot = this._shots[0];
      }
    } catch (err) {
      this._error = `Failed to load shot history: ${err}`;
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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    this._chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: shot.timestamps.map((t) => t.toFixed(1)),
        datasets: [
          {
            label: "Pressure (bar)",
            data: shot.pump_pressures,
            borderColor: "#e74c3c",
            backgroundColor: "rgba(231, 76, 60, 0.1)",
            yAxisID: "y-pressure",
            tension: 0.3,
            fill: true,
          },
          {
            label: "Flow (ml/s)",
            data: shot.flow_rates,
            borderColor: "#3498db",
            backgroundColor: "rgba(52, 152, 219, 0.1)",
            yAxisID: "y-flow",
            tension: 0.3,
            fill: true,
          },
          {
            label: "Weight (g)",
            data: shot.weights,
            borderColor: "#2ecc71",
            backgroundColor: "rgba(46, 204, 113, 0.1)",
            yAxisID: "y-weight",
            tension: 0.3,
            fill: true,
          },
          {
            label: "Brew Temp (°C)",
            data: shot.brew_group_temps,
            borderColor: "#f39c12",
            backgroundColor: "rgba(243, 156, 18, 0.1)",
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
            title: { display: true, text: "Time (s)", font: { size: 10 } },
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
            min: 80,
            max: 100,
            title: { display: false },
            ticks: { font: { size: 9 }, color: "#f39c12" },
            grid: { display: false },
            display: false,
          },
        },
      },
    });
  }

  private _selectShot(shot: ShotData): void {
    this._selectedShot = shot;
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

  protected render(): TemplateResult {
    if (!this._config || !this.hass) {
      return html``;
    }

    return html`
      <ha-card>
        <div class="card-header">
          <span class="title">${this._config.title}</span>
          <ha-icon-button
            .path=${"M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"}
            @click=${this._loadShotHistory}
          ></ha-icon-button>
        </div>
        <div class="card-content">
          ${this._loading
            ? html`<div class="loading">Loading...</div>`
            : this._error
              ? html`<div class="error">${this._error}</div>`
              : this._renderContent()}
        </div>
      </ha-card>
    `;
  }

  private _renderContent(): TemplateResult {
    if (this._shots.length === 0) {
      return html`<div class="empty">No shots recorded yet</div>`;
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
                <ha-icon icon="mdi:weight-gram"></ha-icon>
                ${this._selectedShot.weights.length > 0
                  ? `${this._selectedShot.weights[this._selectedShot.weights.length - 1].toFixed(1)}g`
                  : "N/A"}
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
          (shot, index) => html`
            <div
              class="shot-item ${this._selectedShot === shot ? "selected" : ""}"
              @click=${() => this._selectShot(shot)}
            >
              <span class="shot-number">#${this._shots.length - index}</span>
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

    .shot-number {
      font-weight: 500;
      min-width: 30px;
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
