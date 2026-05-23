import { describe, it, expect, vi } from "vitest";

vi.mock("chart.js", () => ({
  Chart: Object.assign(vi.fn(), { register: vi.fn() }),
  LineController: class {},
  LineElement: class {},
  PointElement: class {},
  LinearScale: class {},
  CategoryScale: class {},
  Tooltip: class {},
  Legend: class {},
  Filler: class {},
}));

import { XeniaHomeCard } from "../src/xenia-home-card";

describe("getConfigForm()", () => {
  it("F13: schema contains all 5 expected fields in order", () => {
    const form = XeniaHomeCard.getConfigForm();
    const names = form.schema.map((s: { name: string }) => s.name);
    expect(names).toEqual([
      "entity",
      "title",
      "show_chart",
      "chart_height",
      "max_shots",
    ]);
  });

  it("F14: assertConfig throws for chart_height below range", () => {
    const form = XeniaHomeCard.getConfigForm();
    expect(() =>
      form.assertConfig!({ type: "custom:xenia-home-card", chart_height: -1 }),
    ).toThrow();
  });

  it("F15: assertConfig accepts valid in-range config", () => {
    const form = XeniaHomeCard.getConfigForm();
    expect(() =>
      form.assertConfig!({
        type: "custom:xenia-home-card",
        chart_height: 200,
        max_shots: 10,
      }),
    ).not.toThrow();
  });
});
