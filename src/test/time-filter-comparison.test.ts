import { describe, expect, it } from "vitest";
import { CUSTOM_SENTINEL, resolveComparisonRange, toDateStr } from "@/components/dashboard/TimeFilter";

describe("same calendar period in earlier years", () => {
  it("compares November 1–13, 2026 with November 1–13, 2025", () => {
    const range = resolveComparisonRange(CUSTOM_SENTINEL, "year1", new Date(2026, 10, 1), new Date(2026, 10, 13));
    expect([toDateStr(range.from), toDateStr(range.to)]).toEqual(["2025-11-01", "2025-11-13"]);
  });

  it("compares November 1–13, 2026 with November 1–13, 2024", () => {
    const range = resolveComparisonRange(CUSTOM_SENTINEL, "year2", new Date(2026, 10, 1), new Date(2026, 10, 13));
    expect([toDateStr(range.from), toDateStr(range.to)]).toEqual(["2024-11-01", "2024-11-13"]);
  });

  it.each(["year1", "year2"] as const)("clamps February 29 to February 28 for %s", (period) => {
    const range = resolveComparisonRange(CUSTOM_SENTINEL, period, new Date(2024, 1, 29), new Date(2024, 1, 29));
    const year = period === "year1" ? 2023 : 2022;
    expect([toDateStr(range.from), toDateStr(range.to)]).toEqual([`${year}-02-28`, `${year}-02-28`]);
  });

  it("keeps the previous inclusive period unchanged", () => {
    const range = resolveComparisonRange(CUSTOM_SENTINEL, "previous", new Date(2026, 10, 1), new Date(2026, 10, 13));
    expect([toDateStr(range.from), toDateStr(range.to)]).toEqual(["2026-10-19", "2026-10-31"]);
  });
});