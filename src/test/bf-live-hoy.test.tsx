import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Today } from "@/pages/BfLive";
import type { BfToday } from "@/lib/bf-live";

const hoy = (over: Partial<BfToday> = {}): BfToday => ({
  tiendas_venta: 0, tiendas_pedidos: 0, online_venta: 0, online_pedidos: 0,
  online_ayer_misma_hora: 0, online_ayer: 0, tiendas_ayer: 0,
  dias_restantes: 0, ritmo_necesario_dia: 0, ...over,
});

function renderSection(node: React.ReactElement) {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(node));
  const text = (host.textContent ?? "").replace(/\s+/g, " ").trim();
  const html = host.innerHTML;
  const bar = host.querySelector("progress");
  const cards = host.querySelectorAll("article").length;
  act(() => root.unmount());
  return { text, html, barClass: bar?.getAttribute("class") ?? "", cards };
}

// 28 nov 2026, 11:45 a. m. en Bogotá
const NOW = Date.parse("2026-11-28T16:45:00Z");

describe("Black Friday Live HOY section", () => {
  it("shows the Bogota date, the summed total, the day goal and the online comparison", () => {
    const { text, barClass, cards } = renderSection(
      <Today hoy={hoy({ tiendas_venta: 120_000_000, tiendas_pedidos: 18, online_venta: 45_000_000, online_pedidos: 12,
        online_ayer_misma_hora: 36_000_000, online_ayer: 80_000_000, tiendas_ayer: 210_000_000,
        dias_restantes: 3, ritmo_necesario_dia: 0, meta_dia: 100_000_000 })} now={NOW} />,
    );
    expect(cards).toBe(3);
    expect(text).toContain("HOY · sábado 28 nov");
    expect(text).toContain("VENTA HOY TOTAL");
    expect(text).toContain("$165 M");
    expect(text).toContain("Meta del día $100 M · 165%");
    expect(text).toContain("ONLINE HOY");
    expect(text).toContain("12 pedidos");
    expect(text).toContain("▲ +25% vs ayer a esta hora");
    expect(text).not.toContain("▼");
    expect(text).toContain("TIENDAS HOY");
    expect(text).toContain("18 ventas");
    expect(text).toContain("según facturas NetSuite · actualiza cada 10 min");
    expect(text).not.toContain("Ayer total");
    expect(barClass).toContain("bf-budget-success");
  });

  it("hides the online comparison when yesterday has no reference at the same hour", () => {
    const { text } = renderSection(
      <Today hoy={hoy({ tiendas_venta: 5_000_000, tiendas_pedidos: 2, online_venta: 9_000_000, online_pedidos: 3,
        online_ayer_misma_hora: 0, online_ayer: 40_000_000, tiendas_ayer: 90_000_000,
        dias_restantes: 3, ritmo_necesario_dia: 0, meta_dia: 100_000_000 })} now={NOW} />,
    );
    expect(text).not.toContain("vs ayer a esta hora");
    expect(text).not.toContain("▲");
    expect(text).not.toContain("▼");
    expect(text).toContain("$14 M");
    expect(text).toContain("Meta del día $100 M · 14%");
  });

  it("marks the day bar green once the goal is reached and shows the drop against yesterday", () => {
    const { text, barClass } = renderSection(
      <Today hoy={hoy({ tiendas_venta: 80_000_000, tiendas_pedidos: 12, online_venta: 30_000_000, online_pedidos: 7,
        online_ayer_misma_hora: 50_000_000, online_ayer: 70_000_000, tiendas_ayer: 150_000_000,
        dias_restantes: 3, ritmo_necesario_dia: 0, meta_dia: 100_000_000 })} now={NOW} />,
    );
    expect(barClass).toContain("bf-budget-success");
    expect(barClass).not.toContain("bf-budget-warning");
    expect(text).toContain("Meta del día $100 M · 110%");
    expect(text).toContain("▼ -40% vs ayer a esta hora");
    expect(text).not.toContain("▲");
  });

  it("never divides by zero when the required daily pace is missing", () => {
    const { text, barClass } = renderSection(
      <Today hoy={hoy({ tiendas_venta: 20_000_000, tiendas_pedidos: 4, online_venta: 10_000_000, online_pedidos: 2,
        online_ayer_misma_hora: 10_000_000, online_ayer: 30_000_000, tiendas_ayer: 60_000_000,
        dias_restantes: 3, ritmo_necesario_dia: 0 })} now={NOW} />,
    );
    expect(text).toContain("Meta del día $0 M · 0%");
    expect(barClass).toContain("bf-budget-warning");
  });

  it("shows the stores growth against yesterday at the same hour in green", () => {
    const { text } = renderSection(
      <Today hoy={hoy({ tiendas_venta: 60_000_000, tiendas_pedidos: 9, online_venta: 10_000_000, online_pedidos: 2,
        online_ayer_misma_hora: 10_000_000, online_ayer: 30_000_000, tiendas_ayer: 60_000_000,
        dias_restantes: 3, ritmo_necesario_dia: 0, meta_dia: 100_000_000,
        tiendas_comparativo: { var_pct: 12.5 } })} now={NOW} />,
    );
    expect(text).toContain("▲ +12,5% vs ayer a esta hora");
    expect(text).toContain("según facturas NetSuite · actualiza cada 10 min");
    expect(text).not.toContain("▼");
  });

  it("shows the stores drop against yesterday at the same hour in red", () => {
    const { text, html } = renderSection(
      <Today hoy={hoy({ tiendas_venta: 40_000_000, tiendas_pedidos: 6, online_venta: 10_000_000, online_pedidos: 2,
        online_ayer_misma_hora: 0, online_ayer: 30_000_000, tiendas_ayer: 60_000_000,
        dias_restantes: 3, ritmo_necesario_dia: 0, meta_dia: 100_000_000,
        tiendas_comparativo: { var_pct: -8 } })} now={NOW} />,
    );
    expect(text).toContain("▼ -8% vs ayer a esta hora");
    expect(text).not.toContain("▲");
    expect(html).toContain("text-destructive");
  });

  it("hides the stores comparison when NetSuite has no reference for this hour yesterday", () => {
    const { text } = renderSection(
      <Today hoy={hoy({ tiendas_venta: 40_000_000, tiendas_pedidos: 6, online_venta: 10_000_000, online_pedidos: 2,
        online_ayer_misma_hora: 0, online_ayer: 30_000_000, tiendas_ayer: 60_000_000,
        dias_restantes: 3, ritmo_necesario_dia: 0, meta_dia: 100_000_000,
        tiendas_comparativo: { var_pct: null } })} now={NOW} />,
    );
    expect(text).not.toContain("vs ayer a esta hora");
    expect(text).not.toContain("▲");
    expect(text).not.toContain("▼");
    expect(text).toContain("según facturas NetSuite · actualiza cada 10 min");
  });

  it("marks each ranking row with its variance: up green, down red, null nuevo", () => {
    const { text, html } = renderSection(
      <Today hoy={hoy({ tiendas_venta: 90_000_000, tiendas_pedidos: 14, online_venta: 20_000_000, online_pedidos: 5,
        online_ayer_misma_hora: 20_000_000, online_ayer: 40_000_000, tiendas_ayer: 90_000_000,
        dias_restantes: 3, ritmo_necesario_dia: 0, meta_dia: 100_000_000,
        ranking_tiendas: [
          { tienda: "Andino", venta: 50_000_000, pedidos: 8, var_pct: 12 },
          { tienda: "Chia", venta: 30_000_000, pedidos: 4, var_pct: -5 },
          { tienda: "Bogota", venta: 10_000_000, pedidos: 2, var_pct: null },
        ] })} now={NOW} />,
    );
    expect(text).toContain("▲ 12%");
    expect(text).toContain("▼ 5%");
    expect(text).toContain("nuevo");
    expect(html).toContain("text-success");
    expect(html).toContain("text-destructive");
  });
});
