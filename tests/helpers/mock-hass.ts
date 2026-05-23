import { vi, type Mock } from "vitest";
import type { HomeAssistant, HassEntity } from "../../src/types";

export interface MockTriggerMessage {
  variables: {
    trigger: {
      to_state: {
        attributes: Record<string, unknown>;
      };
    };
  };
}

export interface MockHass extends HomeAssistant {
  callWS: Mock;
  connection: HomeAssistant["connection"] & {
    subscribeEvents: Mock;
    subscribeMessage: Mock;
  };
  formatEntityName?: Mock;
  __triggerCallback?: (msg: MockTriggerMessage) => void;
  __eventCallback?: (event: unknown) => void;
  __unsubscribeSpy: Mock;
}

export interface CreateMockHassOptions {
  language?: string;
  locale?: { language: string };
  states?: Record<string, HassEntity>;
  history?: Record<string, unknown[]>;
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
      if (message.type === "history/history_during_period") {
        return Promise.resolve(options.history ?? {});
      }
      return Promise.resolve(undefined);
    }),
    connection: {
      subscribeEvents: vi
        .fn()
        .mockImplementation((cb: (e: unknown) => void) => {
          mock.__eventCallback = cb;
          return Promise.resolve(unsubscribeSpy);
        }),
      subscribeMessage: vi
        .fn()
        .mockImplementation((cb: (msg: MockTriggerMessage) => void) => {
          mock.__triggerCallback = cb;
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
