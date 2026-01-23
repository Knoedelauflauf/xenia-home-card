import { LitElement, html, css, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { XeniaHomeCardConfig, HomeAssistant } from "./types";
import { localize } from "./localize";

@customElement("xenia-home-card-editor")
export class XeniaHomeCardEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: XeniaHomeCardConfig;
  @state() private _entities: string[] = [];

  public setConfig(config: XeniaHomeCardConfig): void {
    this._config = config;
  }

  private _t(key: string): string {
    return localize(key, this.hass?.language);
  }

  protected firstUpdated(): void {
    this._loadEntities();
  }

  protected updated(changedProps: Map<string, unknown>): void {
    if (changedProps.has("hass")) {
      this._loadEntities();
    }
    if (
      changedProps.has("_entities") &&
      this._entities.length > 0 &&
      this._config &&
      !this._config.entity
    ) {
      const newConfig = { ...this._config, entity: this._entities[0] };
      this._config = newConfig;
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: newConfig },
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  private _loadEntities(): void {
    if (!this.hass) return;

    this._entities = Object.keys(this.hass.states)
      .filter(
        (entityId) =>
          entityId.startsWith("event.xenia_espresso_machine") ||
          (entityId.startsWith("event.xenia_") &&
            entityId.includes("shot_tracker"))
      )
      .sort();
  }

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config || !this.hass) return;

    const target = ev.target as HTMLElement;
    const configKey = (target as HTMLElement & { configKey?: string }).configKey;

    if (!configKey) return;

    let newValue: string | number | boolean | undefined;
    const detail = ev.detail;

    const targetValue = (target as HTMLElement & { value?: string }).value;
    if (targetValue !== undefined) {
      newValue = targetValue;
    } else if (detail !== undefined) {
      if (typeof detail === "object" && detail !== null && "value" in detail) {
        newValue = (detail as { value?: string | number | boolean }).value;
      } else if (typeof detail !== "object") {
        newValue = detail;
      }
    }

    if (typeof newValue === "object") return;

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

    return html`
      <div class="card-config">
        <div class="config-row">
          <ha-select
            naturalMenuWidth
            fixedMenuPosition
            .label=${this._t("editor.entity")}
            .configKey=${"entity"}
            .value=${this._config.entity || this._entities[0] || ""}
            @selected=${this._valueChanged}
            @closed=${(e: Event) => e.stopPropagation()}
          >
            ${this._entities.map(
              (entity) => html`
                <mwc-list-item .value=${entity}>${entity}</mwc-list-item>
              `
            )}
          </ha-select>
        </div>

        <div class="config-row">
          <ha-textfield
            .label=${this._t("editor.title")}
            .configKey=${"title"}
            .value=${this._config.title || ""}
            @input=${(e: Event) => {
              const target = e.target as HTMLInputElement & { configKey?: string };
              target.configKey = "title";
              this._valueChanged(new CustomEvent("value-changed", { detail: { value: target.value } }));
            }}
          ></ha-textfield>
        </div>

        <div class="config-row toggle-row">
          <span class="toggle-label">${this._t("editor.show_chart")}</span>
          <ha-switch
            .checked=${this._config.show_chart !== false}
            .configKey=${"show_chart"}
            @change=${this._toggleChanged}
          ></ha-switch>
        </div>

        <div class="config-row">
          <ha-textfield
            .label=${this._t("editor.chart_height")}
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
            .label=${this._t("editor.max_shots")}
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
  `;
}
