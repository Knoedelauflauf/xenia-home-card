import { vi, type Mock } from "vitest";
import type { HomeAssistant, HassEntity, ShotData } from "../../src/types";

export interface MockHass extends HomeAssistant {
  callWS: Mock;
  connection: HomeAssistant["connection"] & {
    subscribeEvents: Mock;
  };
  formatEntityName?: Mock;
  __eventCallback?: (event: unknown) => void;
  __unsubscribeSpy: Mock;
}

export interface CreateMockHassOptions {
  language?: string;
  locale?: { language: string };
  states?: Record<string, HassEntity>;
  shots?: ShotData[];
  // Several loaded config entries, keyed by entry id. Without it, `shots`
  // belongs to a single entry.
  machines?: Record<string, { entity: string; shots: ShotData[] }>;
  formatEntityName?: (stateObj: HassEntity) => string;
}

export function createMockHass(options: CreateMockHassOptions = {}): MockHass {
  const unsubscribeSpy = vi.fn();
  const machines = options.machines ?? {
    entry_1: { entity: "", shots: options.shots ?? [] },
  };
  const mock: MockHass = {
    language: options.language ?? "en",
    ...(options.locale ? { locale: options.locale } : {}),
    states: options.states ?? {},
    callService: vi.fn().mockResolvedValue(undefined),
    callWS: vi.fn().mockImplementation((message: Record<string, unknown>) => {
      if (message.type === "config/entity_registry/get") {
        const match = Object.entries(machines).find(
          ([, m]) => m.entity === message.entity_id
        );
        return match
          ? Promise.resolve({
              entity_id: message.entity_id,
              config_entry_id: match[0],
            })
          : Promise.reject({ code: "not_found" });
      }
      const entryIds = Object.keys(machines);
      const entryId = message.entry_id as string | undefined;
      if (entryId === undefined && entryIds.length > 1) {
        return Promise.reject({
          code: "multiple_entries",
          message: "Several entries are loaded; pass entry_id",
        });
      }
      const machine = machines[entryId ?? entryIds[0] ?? ""];
      if (!machine) {
        return Promise.reject({ code: "not_found" });
      }
      const shots = [...machine.shots].sort((a, b) =>
        b.start_time.localeCompare(a.start_time)
      );
      if (message.type === "xenia_home/shots/list") {
        const limit = (message as { limit?: number }).limit;
        const summaries = shots.map((s) => ({
          shot_id: s.start_time,
          start_time: s.start_time,
          brew_end_time: s.brew_end_time,
          duration_seconds: s.duration_seconds,
          final_weight_g: s.weights.at(-1) ?? null,
        }));
        return Promise.resolve({
          shots: limit ? summaries.slice(0, limit) : summaries,
        });
      }
      if (message.type === "xenia_home/shots/get") {
        const ids = (message as { shot_ids: string[] }).shot_ids;
        return Promise.resolve({
          shots: ids
            .map((id) => shots.find((s) => s.start_time === id))
            .filter(Boolean)
            .map((s) => ({ ...(s as ShotData), shot_id: s!.start_time })),
        });
      }
      return Promise.reject({ code: "unknown_command" });
    }),
    connection: {
      subscribeEvents: vi
        .fn()
        .mockImplementation((cb: (e: unknown) => void) => {
          mock.__eventCallback = cb;
          return Promise.resolve(unsubscribeSpy);
        }),
    },
    __unsubscribeSpy: unsubscribeSpy,
  };
  if (options.formatEntityName) {
    mock.formatEntityName = vi.fn(options.formatEntityName);
  }
  return mock;
}
