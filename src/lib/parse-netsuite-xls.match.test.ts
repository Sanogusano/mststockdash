import { describe, it, expect } from "vitest";
import { matchLocation } from "./parse-netsuite-xls";

const maps = [
  { netsuite_location_name: "MEDELLÍN : TIENDAS MONASTERY", internal_location_id: "A" },
  { netsuite_location_name: "BOGOTA : OUTLET", internal_location_id: "B" },
  { netsuite_location_name: "CALI : OUTLET", internal_location_id: "C" },
];

describe("matchLocation", () => {
  it("exact match first", () => {
    expect(matchLocation("BOGOTA : OUTLET", maps)).toMatchObject({ internalLocationId: "B", partial: false });
  });
  it("partial match by last part ignoring case/accents", () => {
    expect(matchLocation("TIENDAS FISICAS : Tiendas Monastery", maps)).toMatchObject({ internalLocationId: "A", partial: true });
  });
  it("ambiguous partial stays unmapped", () => {
    expect(matchLocation("OTRA : OUTLET", maps)).toBeNull();
  });
  it("no match stays unmapped", () => {
    expect(matchLocation("X : NADA", maps)).toBeNull();
  });
});
