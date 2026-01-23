import { LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";

export interface ShotData {
  start_time: string;
  duration_seconds: number;
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
  title?: string;
  show_chart?: boolean;
  chart_height?: number;
  max_shots?: number;
}

export interface HomeAssistant {
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

declare global {
  interface HTMLElementTagNameMap {
    "xenia-home-card": LovelaceCard;
  }
}
