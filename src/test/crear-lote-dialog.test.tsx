import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CrearLoteDialog } from "@/components/precios/CrearLoteDialog";
import type { PrecioRow } from "@/components/precios/types";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));

const row = {
  product_id: "p1",
  producto: "Camisa",
  precio_lista: 100000,
  precio_actual: 80000,
  costo: 40000,
  dcto_actual: 0.2,
} as unknown as PrecioRow;

const abrir = () =>
  render(
    <CrearLoteDialog
      open
      onOpenChange={() => {}}
      modo="poner"
      rows={[row]}
      onCreated={() => {}}
    />,
  );

const marcar = (id: string) => {
  const el = document.getElementById(id) as HTMLElement;
  fireEvent.click(el);
  return el;
};

const crearLote = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Crear lote" }));
  await screen.findByText(/Creando…|Crear lote/);
};

const payload = () => rpc.mock.calls[rpc.mock.calls.length - 1][1] as Record<string, unknown>;

beforeEach(() => {
  cleanup();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 7, error: null });
});

describe("CrearLoteDialog · permitir subir precio", () => {
  it("no muestra la casilla ni la envía activa cuando la acción es Subir", async () => {
    abrir();
    expect(screen.queryByRole("checkbox")).toBeNull();
    await crearLote();
    expect(payload()).toMatchObject({ p_accion: "subir", p_permitir_subir: false });
  });

  it("muestra la casilla con Dejar en, avisa en ámbar y envía p_permitir_subir true", async () => {
    abrir();
    marcar("acc-fijar");
    const box = marcar("permitir-subir");
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Este lote puede subir precios a variantes que hoy tienen más descuento.")).toBeInTheDocument();
    await crearLote();
    expect(payload()).toMatchObject({ p_accion: "fijar", p_permitir_subir: true });
  });

  it("sin la casilla marcada envía p_permitir_subir false y no muestra el aviso", async () => {
    abrir();
    marcar("acc-fijar");
    expect(screen.queryByText(/puede subir precios/)).toBeNull();
    await crearLote();
    expect(payload()).toMatchObject({ p_accion: "fijar", p_permitir_subir: false });
  });

  it("cambiar de acción reinicia la casilla", () => {
    abrir();
    marcar("acc-fijar");
    marcar("permitir-subir");
    marcar("acc-subir");
    marcar("acc-fijar");
    expect((document.getElementById("permitir-subir") as HTMLElement).getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText(/puede subir precios/)).toBeNull();
  });
});
