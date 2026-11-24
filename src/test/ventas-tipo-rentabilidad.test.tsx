import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

const calls = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: calls }));

import { VentasTipoCards } from "@/components/dashboard/ExecutiveDashboard";

const RPC_ROW = {
  pct_full_price: 26.7,
  pct_rebajas: 21.1,
  pct_desc_promo: 52.2,
  desc_prom_full_price: 0,
  desc_prom_rebajas: 53,
  desc_prom_promo: 48.5,
  venta_neta_sin_iva: 6_924_108_689,
  costo_total: 2_576_812_454,
  utilidad_bruta: 4_267_136_955,
  margen_bruto_pct: 62.3,
  cobertura_costo_pct: 98.8,
};

afterEach(() => { vi.clearAllMocks(); document.body.innerHTML = ""; });

async function renderCards(overrides: Partial<typeof RPC_ROW> = {}) {
  calls.rpc.mockResolvedValue({ data: [{ ...RPC_ROW, ...overrides }] });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <TooltipProvider delayDuration={0}>
          <VentasTipoCards days={30} canal={null} locationId={null} zona={null} />
        </TooltipProvider>
      </MemoryRouter>,
    );
  });
  return { host, root };
}

const text = (host: HTMLElement) => (host.textContent ?? "").replace(/\s+/g, " ");
const cardWithLabel = (host: HTMLElement, label: string) => {
  const labelEl = Array.from(host.querySelectorAll("p")).find((p) => p.textContent === label);
  return labelEl?.closest("div.glass-card") ?? null;
};

describe("Fila % Full Price / % Rebajas / % Desc. Promo / Rentabilidad", () => {
  it("usa una sola llamada a reporte_pct_ventas_por_tipo", async () => {
    const { host, root } = await renderCards();
    expect(calls.rpc).toHaveBeenCalledTimes(1);
    expect(calls.rpc.mock.calls[0][0]).toBe("reporte_pct_ventas_por_tipo");
    act(() => root.unmount());
  });

  it("muestra las 4 tarjetas con su porcentaje y el descuento promedio", async () => {
    const { host, root } = await renderCards();
    const t = text(host);
    expect(t).toContain("% Full Price");
    expect(t).toContain("% Rebajas");
    expect(t).toContain("% Desc. Promo");
    expect(t).toContain("Rentabilidad");
    expect(t).toContain("26.7%");
    expect(t).toContain("21.1%");
    expect(t).toContain("52.2%");
    expect(t).toContain("62.3%");
    expect(t).toContain("Desc. promedio: 0.0%");
    expect(t).toContain("Desc. promedio: 53.0%");
    expect(t).toContain("Desc. promedio: 48.5%");
    act(() => root.unmount());
  });

  it("Rentabilidad muestra utilidad y venta neta en millones", async () => {
    const { host, root } = await renderCards();
    const card = cardWithLabel(host, "Rentabilidad");
    expect(card?.textContent).toContain("Utilidad $4.267M · Venta neta $6.924M");
    act(() => root.unmount());
  });

  it("Rentabilidad es verde desde 55%, ámbar entre 45% y 55% y rojo por debajo", async () => {
    const verde = await renderCards();
    expect(cardWithLabel(verde.host, "Rentabilidad")?.querySelector("p.text-xl")).toHaveClass("text-emerald-600");
    act(() => verde.root.unmount());

    const ambar = await renderCards({ margen_bruto_pct: 49.4 });
    expect(cardWithLabel(ambar.host, "Rentabilidad")?.querySelector("p.text-xl")).toHaveClass("text-amber-500");
    expect(text(ambar.host)).toContain("49.4%");
    act(() => ambar.root.unmount());

    const rojo = await renderCards({ margen_bruto_pct: 41.2 });
    expect(cardWithLabel(rojo.host, "Rentabilidad")?.querySelector("p.text-xl")).toHaveClass("text-destructive");
    act(() => rojo.root.unmount());
  });

  it("el tooltip explica el margen con la cobertura de costo", async () => {
    const { host, root } = await renderCards();
    const card = cardWithLabel(host, "Rentabilidad");
    const trigger = card?.parentElement;
    await act(async () => {
      trigger?.dispatchEvent(new Event("pointermove", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
    });
    const tip = Array.from(document.querySelectorAll("[role='tooltip']")).map((n) => n.textContent ?? "").join(" ");
    expect(tip).toContain("Margen bruto sobre venta neta sin IVA");
    expect(tip).toContain("Cobertura de costo: 98.8%");
    act(() => root.unmount());
  });

  it("la fila pasa a 2 columnas en móvil y 4 en escritorio", async () => {
    const { host, root } = await renderCards();
    const grid = host.querySelector("div.grid");
    expect(grid?.className).toContain("grid-cols-2");
    expect(grid?.className).toContain("lg:grid-cols-4");
    act(() => root.unmount());
  });
});
