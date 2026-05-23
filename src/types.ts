export interface ShotData {
  start_time: string;
  brew_end_time?: string | null;
  duration_seconds: number;
  afterflow_seconds?: number;
  timestamps: number[];
  brew_group_temps: number[];
  brew_boiler_temps: number[];
  pump_pressures: number[];
  flow_rates: number[];
  weights: number[];
}

export interface XeniaHomeCardConfig extends LovelaceCardConfig {
  type: string;
  entity?: string;
  event_type?: string;
  title?: string;
  show_chart?: boolean;
  chart_height?: number;
  max_shots?: number;
}

export interface HassLocale {
  language?: string;
  number_format?: string;
  time_format?: string;
  date_format?: string;
}

export interface HomeAssistant {
  language: string;
  locale?: HassLocale;
  states: { [entity_id: string]: HassEntity };
  callService: (
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>
  ) => Promise<void>;
  callWS: <T>(message: Record<string, unknown>) => Promise<T>;
  connection: {
    subscribeEvents: (
      callback: (event: HassEvent) => void,
      eventType: string
    ) => Promise<() => void>;
    subscribeMessage: <T = unknown>(
      callback: (message: T) => void,
      subscription: Record<string, unknown>
    ) => Promise<() => void>;
  };
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HassEvent {
  event_type: string;
  data: Record<string, unknown>;
  origin: string;
  time_fired: string;
}

export interface LovelaceCardConfig {
  type: string;
  [key: string]: unknown;
}

export interface LovelaceCard extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: LovelaceCardConfig): void;
  getCardSize?(): number;
}

declare global {
  interface HTMLElementTagNameMap {
    "xenia-home-card": LovelaceCard;
  }
}
