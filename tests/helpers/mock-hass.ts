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
  formatEntityName?: (stateObj: HassEntity) => string;
}

export function createMockHass(options: CreateMockHassOptions = {}): MockHass {
  const unsubscribeSpy = vi.fn();
  const mock: MockHass = {
    language: options.language ?? "en",
    ...(options.locale ? { locale: options.locale } : {}),
    states: options.states ?? {},
    callService: vi.fn().mockResolvedValue(undefined),
    callWS: vi.fn().mockImplementation((message: Record<string, unknown>) => {
      const shots = [...(options.shots ?? [])].sort((a, b) =>
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
