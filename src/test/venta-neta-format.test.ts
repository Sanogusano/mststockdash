import { describe, expect, it } from "vitest";
import { fmtVentaNeta } from "@/lib/venta-neta-format";

describe("fmtVentaNeta", () => {
  it("shows millions with one decimal and a comma", () => {
    expect(fmtVentaNeta(45145249)).toBe("$45,1M");
    expect(fmtVentaNeta(622928542)).toBe("$622,9M");
  });

  it("shows thousands as k below one million", () => {
    expect(fmtVentaNeta(850000)).toBe("$850k");
    expect(fmtVentaNeta(1500)).toBe("$2k");
  });

  it("shows billions as whole millions with a thousands dot, never MM", () => {
    expect(fmtVentaNeta(2081000000)).toBe("$2.081M");
    expect(fmtVentaNeta(2081000000)).not.toContain("MM");
  });

  it("handles zero, missing and negative values", () => {
    expect(fmtVentaNeta(0)).toBe("$0");
    expect(fmtVentaNeta(null)).toBe("—");
    expect(fmtVentaNeta(undefined)).toBe("—");
    expect(fmtVentaNeta(-45145249)).toBe("-$45,1M");
  });
});
