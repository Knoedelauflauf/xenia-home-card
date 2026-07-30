import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { createMockHass, type MockHass } from "./helpers/mock-hass";
import {
  makeShot,
  makeEventState,
  makeIdleEventState,
} from "./helpers/fixtures";
import type { HassEntity } from "../src/types";

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

interface CardElement extends HTMLElement {
  shadowRoot: ShadowRoot;
  hass: MockHass;
  setConfig: (config: unknown) => void;
  updateComplete: Promise<unknown>;
  requestUpdate: () => void;
  getGridOptions: () => unknown;
}

// Lets the async history-load microtasks settle after mount. 20ms is empirically
// enough in happy-dom; raise per-test if a specific case needs longer.
function flush(ms = 20): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const mounted: CardElement[] = [];

// Mirrors Lovelace: config and hass are set before the card is attached, so
// firstUpdated already sees both.
async function mountCard(hass: MockHass, config = {}): Promise<CardElement> {
  const el = document.createElement("xenia-home-card") as CardElement;
  el.setConfig({ type: "custom:xenia-home-card", ...config });
  el.hass = hass;
  document.body.appendChild(el);
  mounted.push(el);
  await el.updateComplete;
  return el;
}

// Simulates a state change: Lovelace hands the card a fresh hass object with
// a fresh states map. Returns the new hass so callers can chain updates.
async function pushHass(
  el: CardElement,
  hass: MockHass,
  states: Record<string, HassEntity>
): Promise<MockHass> {
  const next: MockHass = { ...hass, states };
  el.hass = next;
  await el.updateComplete;
  return next;
}

function shotItems(el: CardElement): NodeListOf<Element> {
  return el.shadowRoot.querySelectorAll(".shot-item");
}

afterEach(() => {
  for (const el of mounted.splice(0)) {
    el.remove();
  }
});

describe("xenia-home-card mount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with no shots when the entity is idle and history is empty", async () => {
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeIdleEventState() },
    });
    const el = await mountCard(hass);
    await flush(10);
    el.requestUpdate();
    await el.updateComplete;
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
      shots,
    });
    const el = await mountCard(hass);
    await flush();
    el.requestUpdate();
    await el.updateComplete;

    const items = shotItems(el);
    expect(items.length).toBe(3);
    expect(items[0]!.classList.contains("selected")).toBe(true);

    const canvas = el.shadowRoot.querySelector("#shot-chart");
    expect(canvas).not.toBeNull();
  });

  it("F2: live shot via hass state change appears in the list", async () => {
    const initial = makeShot({ start_time: "2026-05-18T08:00:00+00:00" });
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(initial) },
      shots: [initial],
    });
    const el = await mountCard(hass);
    await flush();

    const newShot = makeShot({ start_time: "2026-05-18T09:30:00+00:00" });
    await pushHass(el, hass, { [ENTITY_ID]: makeEventState(newShot) });

    expect(shotItems(el).length).toBe(2);
  });

  it("F3: state change with a duplicate start_time does not produce a second entry", async () => {
    const initial = makeShot({ start_time: "2026-05-18T08:00:00+00:00" });
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(initial) },
      shots: [initial],
    });
    const el = await mountCard(hass);
    await flush();

    // New trigger timestamp, same shot attributes.
    await pushHass(el, hass, {
      [ENTITY_ID]: makeEventState(initial, ENTITY_ID, {
        state: "2026-05-18T08:00:05+00:00",
      }),
    });

    expect(shotItems(el).length).toBe(1);
  });

  it("attribute-only update (is_brewing flip) does not push a shot", async () => {
    const initial = makeShot({ start_time: "2026-05-18T08:00:00+00:00" });
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(initial) },
      shots: [initial],
    });
    const el = await mountCard(hass);
    await flush();

    // Unchanged state, but attributes carry a different start_time — without
    // the state guard this would (wrongly) appear as a new shot.
    const sneaky = makeShot({ start_time: "2026-05-18T10:00:00+00:00" });
    await pushHass(el, hass, {
      [ENTITY_ID]: makeEventState(sneaky, ENTITY_ID, {
        state: initial.start_time,
        attributes: { is_brewing: true },
      }),
    });

    expect(shotItems(el).length).toBe(1);
  });

  it("first sighting of the entity pushes its current shot without history", async () => {
    const shot = makeShot({ start_time: "2026-05-18T08:00:00+00:00" });
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(shot) },
    });
    const el = await mountCard(hass);
    await flush();
    el.requestUpdate();
    await el.updateComplete;

    expect(shotItems(el).length).toBe(1);
  });

  it("entity re-resolution resets the last-seen state marker", async () => {
    const shotA = makeShot({ start_time: "2026-05-18T08:00:00+00:00" });
    const shotB = makeShot({ start_time: "2026-05-18T09:00:00+00:00" });
    const renamedEntityId = "event.kaffee";
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(shotA) },
    });
    const el = await mountCard(hass);
    await flush();
    expect(shotItems(el).length).toBe(1);

    // Entity renamed: old id gone, new id carries a new shot but the exact
    // same state string — only a reset marker lets it through.
    await pushHass(el, hass, {
      [renamedEntityId]: makeEventState(shotB, renamedEntityId, {
        state: shotA.start_time,
      }),
    });

    expect(shotItems(el).length).toBe(2);
  });

  it("F4: malformed payload (missing duration_seconds) is ignored", async () => {
    const initial = makeShot({ start_time: "2026-05-18T08:00:00+00:00" });
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(initial) },
      shots: [initial],
    });
    const el = await mountCard(hass);
    await flush();

    const bad = makeEventState(
      makeShot({ start_time: "2026-05-18T11:00:00+00:00" })
    );
    delete bad.attributes.duration_seconds;
    await pushHass(el, hass, { [ENTITY_ID]: bad });

    expect(shotItems(el).length).toBe(1);
  });

  it("F6: auto-detect finds entity renamed to event.kaffee via event_types", async () => {
    const renamedEntityId = "event.kaffee";
    const hass = createMockHass({
      states: { [renamedEntityId]: makeIdleEventState(renamedEntityId) },
    });
    const el = await mountCard(hass);
    await flush();
    expect(shotItems(el).length).toBe(0);

    // event.kaffee matches neither legacy fallback string; only the
    // event_types-based auto-detect can have resolved it, so a shot
    // arriving on this entity proves that resolution worked.
    const shot = makeShot();
    await pushHass(el, hass, {
      [renamedEntityId]: makeEventState(shot, renamedEntityId),
    });

    expect(shotItems(el).length).toBe(1);
  });

  it("F7: show_chart: false hides the canvas", async () => {
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(makeShot()) },
      shots: [makeShot()],
    });
    const el = await mountCard(hass, { show_chart: false });
    await flush();
    el.requestUpdate();
    await el.updateComplete;

    expect(el.shadowRoot.querySelector("#shot-chart")).toBeNull();
  });

  it("F8: toggling show_chart off destroys the chart instance", async () => {
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(makeShot()) },
      shots: [makeShot()],
    });
    const el = await mountCard(hass, { show_chart: true });
    await flush();

    // Confirm chart was constructed.
    expect(ChartModule.Chart).toHaveBeenCalled();
    const chartInstance = (ChartModule.Chart as unknown as Mock).mock
      .results[0]!.value as { destroy: Mock };

    el.setConfig({
      type: "custom:xenia-home-card",
      show_chart: false,
    });
    await el.updateComplete;

    expect(chartInstance.destroy).toHaveBeenCalled();
  });

  it("F9: date format differs between hass.language 'en' and 'de'", async () => {
    const shot = makeShot({ start_time: "2026-05-18T08:30:00+00:00" });
    const hassEn = createMockHass({
      language: "en",
      states: { [ENTITY_ID]: makeEventState(shot) },
      shots: [shot],
    });
    const elEn = await mountCard(hassEn);
    await flush();
    elEn.requestUpdate();
    await elEn.updateComplete;
    const dateEn = elEn.shadowRoot
      .querySelector(".shot-date")
      ?.textContent?.trim();

    const hassDe = createMockHass({
      language: "de",
      states: { [ENTITY_ID]: makeEventState(shot) },
      shots: [shot],
    });
    const elDe = await mountCard(hassDe);
    await flush();
    elDe.requestUpdate();
    await elDe.updateComplete;
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
      shots,
    });
    const el = await mountCard(hass);
    await flush();

    (ChartModule.Chart as unknown as Mock).mockClear();

    const items = el.shadowRoot.querySelectorAll<HTMLElement>(".shot-item");
    // After history load, items[0] is the newest (shots[1]); click the older one.
    items[1]!.click();
    await el.updateComplete;

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
      shots: [shotNoPressure],
    });
    const el = await mountCard(hass);
    await flush();
    el.requestUpdate();
    await el.updateComplete;

    const detailsText =
      el.shadowRoot.querySelector(".shot-details")?.textContent ?? "";
    expect(detailsText).not.toContain("Infinity");
    expect(detailsText).toContain("N/A");
  });

  it("evicted shot can re-enter via live state change after max_shots eviction", async () => {
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
      states: { [ENTITY_ID]: makeEventState(middle) },
      shots: [evictee, middle],
    });
    const el = await mountCard(hass, { max_shots: 2 });
    await flush();

    expect(shotItems(el).length).toBe(2);

    // Push a third shot → evicts the oldest (evictee).
    const next = await pushHass(el, hass, {
      [ENTITY_ID]: makeEventState(third),
    });

    let texts = Array.from(shotItems(el)).map((i) => i.textContent ?? "");
    expect(texts.length).toBe(2);
    // Evictee gone, middle and third remain.
    expect(texts.some((t) => t.includes("11.1"))).toBe(false);
    expect(texts.some((t) => t.includes("22.2"))).toBe(true);
    expect(texts.some((t) => t.includes("33.3"))).toBe(true);

    // Re-fire the evicted shot. With the bug, it'd be silently dropped because
    // its key is still in _shotKeys. With the fix, it re-enters.
    await pushHass(el, next, { [ENTITY_ID]: makeEventState(evictee) });

    // Still 2 items (max_shots), but evictee is back; the next-oldest got evicted.
    texts = Array.from(shotItems(el)).map((i) => i.textContent ?? "");
    expect(texts.length).toBe(2);
    expect(texts.some((t) => t.includes("11.1"))).toBe(true);
  });

  it("requests full payloads exactly for the listed shot ids", async () => {
    const shot = makeShot();
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeIdleEventState() },
      shots: [shot],
    });
    await mountCard(hass);
    const getCall = hass.callWS.mock.calls.find(
      (c) => (c[0] as { type: string }).type === "xenia_home/shots/get"
    );
    expect(getCall?.[0]).toMatchObject({ shot_ids: [shot.start_time] });
  });

  it("shows the integration version hint on unknown_command", async () => {
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeIdleEventState() },
    });
    hass.callWS = vi.fn().mockRejectedValue({ code: "unknown_command" });
    const card = await mountCard(hass);
    expect(card.shadowRoot?.textContent).toContain(
      "Requires Xenia Home integration 0.7.0 or newer"
    );
  });
});

describe("event_type escape hatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("subscribes to the configured event type and delivers shots", async () => {
    const hass = createMockHass({ states: {} });
    const el = await mountCard(hass, { event_type: "my_shot_event" });
    await flush();

    expect(hass.connection.subscribeEvents).toHaveBeenCalledWith(
      expect.any(Function),
      "my_shot_event"
    );

    hass.__eventCallback!({
      event_type: "my_shot_event",
      data: makeShot() as unknown as Record<string, unknown>,
    });
    await el.updateComplete;

    expect(shotItems(el).length).toBe(1);
  });

  it("entity state changes push nothing while event_type is configured", async () => {
    const raw = makeShot({ start_time: "2026-05-18T08:00:00+00:00" });
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(raw) },
    });
    const el = await mountCard(hass, { event_type: "my_shot_event" });
    await flush();

    // Neither the first sighting nor a later state change may deliver the
    // entity's shot — the escape hatch bypasses the integration's updates.
    expect(shotItems(el).length).toBe(0);
    const next = makeShot({ start_time: "2026-05-18T09:30:00+00:00" });
    await pushHass(el, hass, { [ENTITY_ID]: makeEventState(next) });
    expect(shotItems(el).length).toBe(0);

    // The custom event remains the sole delivery path, even for a shot with
    // the same start_time the entity already announced.
    hass.__eventCallback!({
      event_type: "my_shot_event",
      data: next as unknown as Record<string, unknown>,
    });
    await el.updateComplete;
    expect(shotItems(el).length).toBe(1);
  });

  it("F12: disconnectedCallback unsubscribes from the event bus", async () => {
    const hass = createMockHass({ states: {} });
    const el = await mountCard(hass, { event_type: "my_shot_event" });
    await flush();

    el.remove();
    expect(hass.__unsubscribeSpy).toHaveBeenCalledTimes(1);
  });
});

describe("brewing indicator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the indicator while is_brewing is true", async () => {
    const shot = makeShot();
    const hass = createMockHass({
      states: {
        [ENTITY_ID]: makeEventState(shot, ENTITY_ID, {
          attributes: { is_brewing: true },
        }),
      },
      shots: [shot],
    });
    const el = await mountCard(hass);

    const indicator = el.shadowRoot.querySelector(".brewing-indicator");
    expect(indicator).not.toBeNull();
    expect(indicator!.textContent).toContain("Brewing");
  });

  it("hides the indicator when is_brewing is false", async () => {
    const shot = makeShot();
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(shot) },
      shots: [shot],
    });
    const el = await mountCard(hass);

    expect(el.shadowRoot.querySelector(".brewing-indicator")).toBeNull();
  });

  it("toggles with attribute-only hass updates", async () => {
    const shot = makeShot();
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(shot) },
      shots: [shot],
    });
    const el = await mountCard(hass);
    await flush();
    expect(el.shadowRoot.querySelector(".brewing-indicator")).toBeNull();

    const brewing = await pushHass(el, hass, {
      [ENTITY_ID]: makeEventState(shot, ENTITY_ID, {
        attributes: { is_brewing: true },
      }),
    });
    expect(el.shadowRoot.querySelector(".brewing-indicator")).not.toBeNull();

    await pushHass(el, brewing, {
      [ENTITY_ID]: makeEventState(shot, ENTITY_ID, {
        attributes: { is_brewing: false },
      }),
    });
    expect(el.shadowRoot.querySelector(".brewing-indicator")).toBeNull();
  });
});

describe("getGridOptions", () => {
  it("returns 6 rows when show_chart is true (default)", async () => {
    const hass = createMockHass({
      states: { [ENTITY_ID]: makeEventState(makeShot()) },
    });
    const el = await mountCard(hass);
    const grid = el.getGridOptions();
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
    });
    const el = await mountCard(hass, { show_chart: false });
    const grid = el.getGridOptions();
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
      formatEntityName: () => "Shot tracker — formatted",
    });
    const el = await mountCard(hass);
    await flush();
    el.requestUpdate();
    await el.updateComplete;

    const title = el.shadowRoot.querySelector(".title")?.textContent?.trim();
    expect(title).toBe("Shot tracker — formatted");
  });

  it("falls back to localized default title when helper is absent", async () => {
    const hass = createMockHass({
      language: "en",
      states: { [ENTITY_ID]: makeEventState(makeShot()) },
    });
    const el = await mountCard(hass);
    await flush();
    el.requestUpdate();
    await el.updateComplete;

    const title = el.shadowRoot.querySelector(".title")?.textContent?.trim();
    expect(title).toBe("Espresso Shots");
  });
});
