import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { ComparisonIndicator, KpiCard, formatKpiDiff } from "@/components/dashboard/ExecutivePresentation";

function renderText(node: React.ReactElement) {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(node));
  // Sibling spans are separated by flex gap in the UI; join their text with a space.
  const text = Array.from(host.querySelectorAll("span")).map((s) => s.textContent ?? "").join(" ").replace(/\s+/g, " ").trim();
  act(() => root.unmount());
  return text;
}

const NoIcon = () => null;

describe("KPI absolute difference vs comparison period", () => {
  it("formats money with sign and compact pesos", () => {
    expect(formatKpiDiff(617_000_000, 0, "money")).toBe("+$617M");
    expect(formatKpiDiff(153_800, 200_000, "money")).toBe("\u2212$46.200");
  });

  it("formats units as thousands-separated integers with uds", () => {
    expect(formatKpiDiff(4210, 0, "units")).toBe("+4.210 uds");
    expect(formatKpiDiff(1180, 1420, "units")).toBe("\u2212240 uds");
  });

  it("formats decimals with two digits and a comma", () => {
    expect(formatKpiDiff(0.08, 0, "decimal")).toBe("+0,08");
    expect(formatKpiDiff(2.1, 2.18, "decimal")).toBe("\u22120,08");
  });

  it("has no difference when both values are zero or unchanged", () => {
    expect(formatKpiDiff(0, 0, "money")).toBeNull();
    expect(formatKpiDiff(5_000_000, 5_000_000, "money")).toBeNull();
  });

  it("shows the difference after the percentage, keeping the arrow and label", () => {
    const text = renderText(
      <ComparisonIndicator actual={1_617_000_000} anterior={1_000_000_000} label="vs ant." diffFormat="money" />,
    );
    expect(text).toBe("\u25b2 61.7% (+$617M) vs ant.");
  });

  it("shows no difference when only a percentage is supplied", () => {
    const text = renderText(
      <ComparisonIndicator actual={0} anterior={0} percentage={-4.2} label="vs ant." diffFormat="money" />,
    );
    expect(text).toBe("\u25bc 4.2% vs ant.");
  });

  it("shows no difference when the supplied values are both zero", () => {
    const text = renderText(
      <ComparisonIndicator actual={0} anterior={0} label="vs ant." diffFormat="units" />,
    );
    expect(text).toBe("\u25b2 0.0% vs ant.");
  });

  it("keeps the percentage-only style untouched (wholesale usage)", () => {
    const text = renderText(
      <ComparisonIndicator actual={0} anterior={0} percentage={1.5} points label="vs ant." />,
    );
    expect(text).toBe("\u25b2 1.5 pp vs ant.");
  });

  it("KpiCard forwards diffFormat to its comparison indicator", () => {
    const text = renderText(
      <KpiCard label="Unidades Vendidas" value="12.000" icon={NoIcon}
        actual={12000} anterior={7790} diffFormat="units" />,
    );
    expect(text).toContain("+4.210 uds");
  });

  it("KpiCard without diffFormat keeps the previous rendering", () => {
    const text = renderText(
      <KpiCard label="Unidades Vendidas" value="12.000" icon={NoIcon}
        actual={12000} anterior={7790} />,
    );
    expect(text).toContain("54.0%");
    expect(text).not.toContain("()");
    expect(text).not.toContain("uds");
  });
});
