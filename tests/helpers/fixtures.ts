import type { ShotData, HassEntity } from "../../src/types";

export const SHOT_BASE: ShotData = {
  start_time: "2026-05-18T08:00:00+00:00",
  brew_end_time: "2026-05-18T08:00:28+00:00",
  duration_seconds: 30.5,
  afterflow_seconds: 2.5,
  timestamps: [0, 1, 2, 3, 28, 30],
  brew_group_temps: [92.0, 92.5, 93.0, 93.0, 92.8, 92.5],
  brew_boiler_temps: [98.0, 98.0, 98.0, 98.0, 97.9, 97.8],
  pump_pressures: [0.5, 6.0, 9.0, 9.2, 9.0, 0.0],
  flow_rates: [0.0, 1.0, 2.0, 2.5, 2.0, 0.0],
  weights: [0.0, 5.0, 12.0, 18.0, 36.0, 36.5],
};

export function makeShot(overrides: Partial<ShotData> = {}): ShotData {
  return { ...SHOT_BASE, ...overrides };
}

export function makeEventState(
  shot: ShotData,
  entityId = "event.xenia_espresso_machine_shot_tracker"
): HassEntity {
  return {
    entity_id: entityId,
    state: shot.start_time,
    attributes: {
      event_type: "shot_completed",
      event_types: ["shot_completed"],
      friendly_name: "Shot tracker",
      ...(shot as unknown as Record<string, unknown>),
    },
    last_changed: shot.start_time,
    last_updated: shot.start_time,
  };
}

export function makeHistoryEntry(shot: ShotData): {
  s: string;
  a: Record<string, unknown>;
  lu: number;
} {
  return {
    s: shot.start_time,
    a: {
      event_type: "shot_completed",
      ...(shot as unknown as Record<string, unknown>),
    },
    lu: Date.parse(shot.start_time) / 1000,
  };
}
