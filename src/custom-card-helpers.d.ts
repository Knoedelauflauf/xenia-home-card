declare module "custom-card-helpers" {
  export interface LovelaceCardConfig {
    type: string;
    [key: string]: unknown;
  }

  export interface LovelaceCard extends HTMLElement {
    hass?: unknown;
    setConfig(config: LovelaceCardConfig): void;
    getCardSize?(): number;
  }
}
