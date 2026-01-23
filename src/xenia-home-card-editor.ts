import { LitElement, html, css, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { XeniaHomeCardConfig, HomeAssistant } from "./types";

@customElement("xenia-home-card-editor")
export class XeniaHomeCardEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: XeniaHomeCardConfig;
  @state() private _entities: string[] = [];

  public setConfig(config: XeniaHomeCardConfig): void {
    this._config = config;
  }

  protected firstUpdated(): void {
    this._loadEntities();
  }

  private _loadEntities(): void {
    if (!this.hass) return;

    this._entities = Object.keys(this.hass.states)
      .filter((entityId) => entityId.startsWith("event.xenia_espresso_machine"))
      .sort();
  }

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config || !this.hass) return;

    const target = ev.target as HTMLElement;
    const configKey = (target as HTMLElement & { configKey?: string }).configKey;

    if (!configKey) return;

    let newValue: string | number | boolean | undefined;
    const detail = ev.detail;

    if (detail !== undefined) {
      if (typeof detail === "object" && "value" in detail) {
        newValue = detail.value;
      } else {
        newValue = detail;
      }
    }

    if (newValue === this._config[configKey as keyof XeniaHomeCardConfig]) {
      return;
    }

    const newConfig = { ...this._config };

    if (newValue === "" || newValue === undefined) {
      delete newConfig[configKey as keyof XeniaHomeCardConfig];
    } else {
      (newConfig as Record<string, unknown>)[configKey] = newValue;
    }

    this._config = newConfig;

    const event = new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  private _toggleChanged(ev: Event): void {
    const target = ev.target as HTMLInputElement & { configKey?: string };
    if (!target.configKey) return;

    const newConfig = {
      ...this._config,
      [target.configKey]: target.checked,
    };

    this._config = newConfig;

    const event = new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  private _numberChanged(ev: Event): void {
    const target = ev.target as HTMLInputElement & { configKey?: string };
    if (!target.configKey) return;

    const value = parseInt(target.value, 10);
    if (isNaN(value)) return;

    const newConfig = {
      ...this._config,
      [target.configKey]: value,
    };

    this._config = newConfig;

    const event = new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  protected render(): TemplateResult {
    if (!this.hass || !this._config) {
      return html``;
    }

    const autoDetectedEntity = this._entities.length > 0 ? this._entities[0] : null;
    const isAutoDetected = !this._config.entity && autoDetectedEntity;

    return html`
      <div class="card-config">
        ${isAutoDetected
          ? html`
              <div class="config-row info-box">
                <ha-icon icon="mdi:check-circle"></ha-icon>
                <span>Auto-detected: ${autoDetectedEntity}</span>
              </div>
            `
          : ""}

        <div class="config-row">
          <ha-select
            naturalMenuWidth
            fixedMenuPosition
            label="Entity (optional - auto-detected)"
            .configKey=${"entity"}
            .value=${this._config.entity || ""}
            @selected=${this._valueChanged}
            @closed=${(e: Event) => e.stopPropagation()}
          >
            <mwc-list-item value="">Auto-detect</mwc-list-item>
            ${this._entities.map(
              (entity) => html`
                <mwc-list-item .value=${entity}>${entity}</mwc-list-item>
              `
            )}
          </ha-select>
        </div>

        <div class="config-row">
          <ha-textfield
            label="Title"
            .configKey=${"title"}
            .value=${this._config.title || "Espresso Shots"}
            @input=${(e: Event) => {
              const target = e.target as HTMLInputElement & { configKey?: string };
              target.configKey = "title";
              this._valueChanged(new CustomEvent("value-changed", { detail: { value: target.value } }));
            }}
          ></ha-textfield>
        </div>

        <div class="config-row toggle-row">
          <span class="toggle-label">Show Chart</span>
          <ha-switch
            .checked=${this._config.show_chart !== false}
            .configKey=${"show_chart"}
            @change=${this._toggleChanged}
          ></ha-switch>
        </div>

        <div class="config-row">
          <ha-textfield
            label="Chart Height (px)"
            type="number"
            min="100"
            max="500"
            .configKey=${"chart_height"}
            .value=${String(this._config.chart_height || 200)}
            @input=${this._numberChanged}
          ></ha-textfield>
        </div>

        <div class="config-row">
          <ha-textfield
            label="Max Shots to Display"
            type="number"
            min="1"
            max="100"
            .configKey=${"max_shots"}
            .value=${String(this._config.max_shots || 10)}
            @input=${this._numberChanged}
          ></ha-textfield>
        </div>
      </div>
    `;
  }

  static styles = css`
    .card-config {
      padding: 16px;
    }

    .config-row {
      margin-bottom: 16px;
    }

    .config-row:last-child {
      margin-bottom: 0;
    }

    ha-select,
    ha-textfield {
      width: 100%;
    }

    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
    }

    .toggle-label {
      font-size: 14px;
    }

    ha-switch {
      --mdc-theme-secondary: var(--primary-color);
    }

    .info-box {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background-color: var(--success-color, #4caf50);
      color: white;
      border-radius: 8px;
      font-size: 14px;
    }

    .info-box ha-icon {
      --mdc-icon-size: 20px;
    }
  `;
}
