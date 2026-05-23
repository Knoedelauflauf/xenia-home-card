import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fixture } from "@open-wc/testing-helpers";
import { html } from "lit";
import { createMockHass } from "./helpers/mock-hass";
import { makeShot, makeEventState, makeHistoryEntry } from "./helpers/fixtures";

// Mock Chart.js — patch with a proper constructor so `new Chart(ctx, ...)` works.
vi.mock("chart.js", () => {
  const ChartConstructor = vi.fn(function MockChart(
    this: Record<string, unknown>
  ) {
    this.destroy = vi.fn();
    this.update = vi.fn();
    this.ctx = { canvas: {} };
    this.scales = { x: { getPixelForValue: () => 0 } };
    this.chartArea = { top: 0, bottom: 100, left: 0, right: 100 };
  });
  return {
    Chart: Object.assign(ChartConstructor, { register: vi.fn() }),
    LineController: class {},
    LineElement: class {},
    PointElement: class {},
    LinearScale: class {},
    CategoryScale: class {},
    Tooltip: class {},
    Legend: class {},
    Filler: class {},
  };
});

// Import after mocks so the card picks up the mocked Chart.
import "../src/xenia-home-card";
import * as ChartModule from "chart.js";

// happy-dom canvas stub — getContext("2d") returns null by default, which
// prevents the Chart constructor from being called. Patch it with a minimal
// CanvasRenderingContext2D stub so chart-related tests can assert on Chart.
HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
  return {
    canvas: this,
    fillRect: () => {},
    clearRect: () => {},
    getImageData: () => ({ data: [] }),
    putImageData: () => {},
    createImageData: () => [],
    setTransform: () => {},
    drawImage: () => {},
    save: () => {},
    fillText: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    stroke: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    arc: () => {},
    fill: () => {},
    measureText: () => ({ width: 0 }),
    transform: () => {},
    rect: () => {},
    clip: () => {},
    strokeText: () => {},
    createLinearGradient: () => ({
      addColorStop: () => {},
    }),
    createRadialGradient: () => ({
      addColorStop: () => {},
    }),
    createPattern: () => ({}),
  } as unknown as CanvasRenderingContext2D;
} as unknown as typeof HTMLCanvasElement.prototype.getContext;

const ENTITY_ID = "event.xenia_espresso_machine_shot_tracker";

// Lets the async history-load microtasks settle after mount. 20ms is empirically
// enough in happy-dom; raise per-test if a specific case needs longer.
function flush(ms = 20): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function mountCard(hass: ReturnType<typeof createMockHass>, config = {}) {
  const el = await fixture(html`<xenia-home-card></xenia-home-card>`);
  (el as unknown as { setConfig: (c: unknown) => void }).setConfig({
    type: "custom:xenia-home-card",
    ...config,
  });
  (el as unknown as { hass: typeof hass }).hass = hass;
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  return el as HTMLElement & { shadowRoot: ShadowRoot };
}

describe("xenia-home-card mount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with no shots when history is empty", async () => {
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(makeShot()) },
      history: { [ENTITY_ID]: [] },
    });
    const el = await mountCard(hass);
    await flush(10);
    (el as unknown as { requestUpdate: () => Promise<void> }).requestUpdate();
    await (el as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;
    const empty = el.shadowRoot.querySelector(".empty");
    expect(empty).not.toBeNull();
  });

  it("F1: renders 3 shots from history, newest selected, chart created", async () => {
    const shots = [
      makeShot({ start_time: "2026-05-18T08:00:00+00:00" }),
      makeShot({ start_time: "2026-05-18T09:00:00+00:00" }),
      makeShot({ start_time: "2026-05-18T10:00:00+00:00" }),
    ];
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(shots[2]!) },
      history: { [ENTITY_ID]: shots.map(makeHistoryEntry) },
    });
    const el = await mountCard(hass);
    await flush();
    (el as unknown as { requestUpdate: () => Promise<void> }).requestUpdate();
    await (el as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;

    const items = el.shadowRoot.querySelectorAll(".shot-item");
    expect(items.length).toBe(3);
    expect(items[0]!.classList.contains("selected")).toBe(true);

    const canvas = el.shadowRoot.querySelector("#shot-chart");
    expect(canvas).not.toBeNull();
  });

  it("F2: live shot via subscribe_trigger appears at top of list", async () => {
    const initial = makeShot({ start_time: "2026-05-18T08:00:00+00:00" });
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(initial) },
      history: { [ENTITY_ID]: [makeHistoryEntry(initial)] },
    });
    const el = await mountCard(hass);
    await flush();

    const newShot = makeShot({ start_time: "2026-05-18T09:30:00+00:00" });
    hass.__triggerCallback!({
      variables: {
        trigger: {
          to_state: {
            attributes: {
              event_type: "shot_completed",
              ...(newShot as unknown as Record<string, unknown>),
            },
          },
        },
      },
    });
    await (el as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;

    const items = el.shadowRoot.querySelectorAll(".shot-item");
    expect(items.length).toBe(2);
  });

  it("F3: duplicate start_time does not produce a second entry", async () => {
    const initial = makeShot({ start_time: "2026-05-18T08:00:00+00:00" });
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(initial) },
      history: { [ENTITY_ID]: [makeHistoryEntry(initial)] },
    });
    const el = await mountCard(hass);
    await flush();

    // Fire the same shot twice.
    for (let i = 0; i < 2; i++) {
      hass.__triggerCallback!({
        variables: {
          trigger: {
            to_state: {
              attributes: {
                event_type: "shot_completed",
                ...(initial as unknown as Record<string, unknown>),
              },
            },
          },
        },
      });
    }
    await (el as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;

    expect(el.shadowRoot.querySelectorAll(".shot-item").length).toBe(1);
  });

  it("F4: malformed payload (missing duration_seconds) is ignored", async () => {
    const initial = makeShot({ start_time: "2026-05-18T08:00:00+00:00" });
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(initial) },
      history: { [ENTITY_ID]: [makeHistoryEntry(initial)] },
    });
    const el = await mountCard(hass);
    await flush();

    hass.__triggerCallback!({
      variables: {
        trigger: {
          to_state: {
            attributes: {
              event_type: "shot_completed",
              start_time: "2026-05-18T11:00:00+00:00",
              // duration_seconds intentionally missing
            },
          },
        },
      },
    });
    await (el as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;

    expect(el.shadowRoot.querySelectorAll(".shot-item").length).toBe(1);
  });

  it("F6: auto-detect finds entity renamed to event.kaffee via event_types", async () => {
    const renamedEntityId = "event.kaffee";
    const shot = makeShot();
    const renamedState = makeEventState(shot, renamedEntityId);
    const hass = createMockHass({
      states: { [renamedEntityId]: renamedState },
      history: { [renamedEntityId]: [makeHistoryEntry(shot)] },
    });
    await mountCard(hass);
    await flush();

    const historyCall = hass.callWS.mock.calls.find(
      (c) => (c[0] as { type: string }).type === "history/history_during_period"
    );
    expect(historyCall).toBeDefined();
    expect((historyCall![0] as { entity_ids: string[] }).entity_ids).toContain(
      renamedEntityId
    );
  });

  it("F7: show_chart: false hides the canvas", async () => {
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(makeShot()) },
      history: { [ENTITY_ID]: [makeHistoryEntry(makeShot())] },
    });
    const el = await mountCard(hass, { show_chart: false });
    await flush();
    (el as unknown as { requestUpdate: () => Promise<void> }).requestUpdate();
    await (el as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;

    expect(el.shadowRoot.querySelector("#shot-chart")).toBeNull();
  });

  it("F8: toggling show_chart off destroys the chart instance", async () => {
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(makeShot()) },
      history: { [ENTITY_ID]: [makeHistoryEntry(makeShot())] },
    });
    const el = await mountCard(hass, { show_chart: true });
    await flush();

    // Confirm chart was constructed.
    expect(ChartModule.Chart).toHaveBeenCalled();
    const chartInstance = (ChartModule.Chart as unknown as Mock).mock
      .results[0]!.value as { destroy: Mock };

    (el as unknown as { setConfig: (c: unknown) => void }).setConfig({
      type: "custom:xenia-home-card",
      show_chart: false,
    });
    await (el as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;

    expect(chartInstance.destroy).toHaveBeenCalled();
  });

  it("F9: date format differs between hass.language 'en' and 'de'", async () => {
    const shot = makeShot({ start_time: "2026-05-18T08:30:00+00:00" });
    const hassEn = createMockHass({
      language: "en",
      states: { [ENTITY_ID]: makeEventState(shot) },
      history: { [ENTITY_ID]: [makeHistoryEntry(shot)] },
    });
    const elEn = await mountCard(hassEn);
    await flush();
    (elEn as unknown as { requestUpdate: () => Promise<void> }).requestUpdate();
    await (elEn as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;
    const dateEn = elEn.shadowRoot
      .querySelector(".shot-date")
      ?.textContent?.trim();

    const hassDe = createMockHass({
      language: "de",
      states: { [ENTITY_ID]: makeEventState(shot) },
      history: { [ENTITY_ID]: [makeHistoryEntry(shot)] },
    });
    const elDe = await mountCard(hassDe);
    await flush();
    (elDe as unknown as { requestUpdate: () => Promise<void> }).requestUpdate();
    await (elDe as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;
    const dateDe = elDe.shadowRoot
      .querySelector(".shot-date")
      ?.textContent?.trim();

    expect(dateEn).toBeTruthy();
    expect(dateDe).toBeTruthy();
    expect(dateEn).not.toEqual(dateDe);
  });

  it("F10: clicking a shot item selects it and re-creates the chart", async () => {
    const shots = [
      makeShot({ start_time: "2026-05-18T08:00:00+00:00" }),
      makeShot({ start_time: "2026-05-18T09:00:00+00:00" }),
    ];
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(shots[1]!) },
      history: { [ENTITY_ID]: shots.map(makeHistoryEntry) },
    });
    const el = await mountCard(hass);
    await flush();

    (ChartModule.Chart as unknown as Mock).mockClear();

    const items = el.shadowRoot.querySelectorAll<HTMLElement>(".shot-item");
    // After history load, items[0] is the newest (shots[1]); click the older one.
    items[1]!.click();
    await (el as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;

    expect(items[1]!.classList.contains("selected")).toBe(true);
    expect(ChartModule.Chart).toHaveBeenCalled();
  });

  it("F11: shot with empty pump_pressures shows N/A, not -Infinity bar", async () => {
    const shotNoPressure = makeShot({
      start_time: "2026-05-18T08:00:00+00:00",
      pump_pressures: [],
    });
    const hass = createMockHass({
      language: "en",
      states: { [ENTITY_ID]: makeEventState(shotNoPressure) },
      history: { [ENTITY_ID]: [makeHistoryEntry(shotNoPressure)] },
    });
    const el = await mountCard(hass);
    await flush();
    (el as unknown as { requestUpdate: () => Promise<void> }).requestUpdate();
    await (el as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;

    const detailsText =
      el.shadowRoot.querySelector(".shot-details")?.textContent ?? "";
    expect(detailsText).not.toContain("Infinity");
    expect(detailsText).toContain("N/A");
  });

  it("F12: disconnectedCallback unsubscribes from the trigger", async () => {
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(makeShot()) },
      history: { [ENTITY_ID]: [makeHistoryEntry(makeShot())] },
    });
    const el = await mountCard(hass);
    await flush();

    el.remove();
    expect(hass.__unsubscribeSpy).toHaveBeenCalledTimes(1);
  });

  it("evicted shot can re-enter via live event after max_shots eviction", async () => {
    // max_shots=2, start with 2 shots, push a third (evicts oldest), then
    // re-push the evicted one — it should reappear in the list.
    // Each shot has a unique duration_seconds so we can identify it in the
    // rendered output without depending on timezone-formatted timestamps.
    const evictee = makeShot({
      start_time: "2026-05-18T08:00:00+00:00",
      duration_seconds: 11.1,
    });
    const middle = makeShot({
      start_time: "2026-05-18T09:00:00+00:00",
      duration_seconds: 22.2,
    });
    const third = makeShot({
      start_time: "2026-05-18T10:00:00+00:00",
      duration_seconds: 33.3,
    });
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(evictee) },
      history: {
        [ENTITY_ID]: [makeHistoryEntry(evictee), makeHistoryEntry(middle)],
      },
    });
    const el = await mountCard(hass, { max_shots: 2 });
    await flush();

    expect(el.shadowRoot.querySelectorAll(".shot-item").length).toBe(2);

    // Push a third shot → evicts the oldest (evictee).
    hass.__triggerCallback!({
      variables: {
        trigger: {
          to_state: {
            attributes: {
              event_type: "shot_completed",
              ...(third as unknown as Record<string, unknown>),
            },
          },
        },
      },
    });
    await (el as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;

    let texts = Array.from(el.shadowRoot.querySelectorAll(".shot-item")).map(
      (i) => i.textContent ?? ""
    );
    expect(texts.length).toBe(2);
    // Evictee gone, middle and third remain.
    expect(texts.some((t) => t.includes("11.1"))).toBe(false);
    expect(texts.some((t) => t.includes("22.2"))).toBe(true);
    expect(texts.some((t) => t.includes("33.3"))).toBe(true);

    // Re-fire the evicted shot. With the bug, it'd be silently dropped because
    // its key is still in _shotKeys. With the fix, it re-enters.
    hass.__triggerCallback!({
      variables: {
        trigger: {
          to_state: {
            attributes: {
              event_type: "shot_completed",
              ...(evictee as unknown as Record<string, unknown>),
            },
          },
        },
      },
    });
    await (el as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;

    // Still 2 items (max_shots), but evictee is back; the next-oldest got evicted.
    texts = Array.from(el.shadowRoot.querySelectorAll(".shot-item")).map(
      (i) => i.textContent ?? ""
    );
    expect(texts.length).toBe(2);
    expect(texts.some((t) => t.includes("11.1"))).toBe(true);
  });
});

describe("getGridOptions", () => {
  it("returns 6 rows when show_chart is true (default)", async () => {
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(makeShot()) },
      history: { [ENTITY_ID]: [] },
    });
    const el = await mountCard(hass);
    const grid = (
      el as unknown as { getGridOptions: () => unknown }
    ).getGridOptions();
    expect(grid).toEqual({
      columns: 12,
      rows: 6,
      min_columns: 6,
      min_rows: 3,
    });
  });

  it("returns 3 rows when show_chart is false", async () => {
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(makeShot()) },
      history: { [ENTITY_ID]: [] },
    });
    const el = await mountCard(hass, { show_chart: false });
    const grid = (
      el as unknown as { getGridOptions: () => unknown }
    ).getGridOptions();
    expect(grid).toEqual({
      columns: 12,
      rows: 3,
      min_columns: 6,
      min_rows: 3,
    });
  });
});

describe("card title fallback", () => {
  it("uses hass.formatEntityName when no title is configured and helper exists", async () => {
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(makeShot()) },
      history: { [ENTITY_ID]: [] },
      formatEntityName: () => "Shot tracker — formatted",
    });
    const el = await mountCard(hass);
    await flush();
    (el as unknown as { requestUpdate: () => Promise<void> }).requestUpdate();
    await (el as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;

    const title = el.shadowRoot.querySelector(".title")?.textContent?.trim();
    expect(title).toBe("Shot tracker — formatted");
  });

  it("falls back to localized default title when helper is absent", async () => {
    const hass = createMockHass({
      language: "en",
      states: { [ENTITY_ID]: makeEventState(makeShot()) },
      history: { [ENTITY_ID]: [] },
    });
    const el = await mountCard(hass);
    await flush();
    (el as unknown as { requestUpdate: () => Promise<void> }).requestUpdate();
    await (el as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;

    const title = el.shadowRoot.querySelector(".title")?.textContent?.trim();
    expect(title).toBe("Espresso Shots");
  });
});
