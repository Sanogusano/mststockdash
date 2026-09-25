import { toast } from "sonner";

type SupabaseLikeError = { code?: string; message?: string } | null | undefined;

export function traducirErrorSupabase(error: unknown): string {
  const e = (error ?? {}) as SupabaseLikeError & object;
  const code = (e as any)?.code as string | undefined;
  const message = String((e as any)?.message ?? "");

  if (code === "PGRST203" || message.includes("Could not choose the best candidate function")) {
    return "La base de datos tiene dos versiones de esta función y no puede decidir cuál usar. Es un problema de configuración, no de los datos que ingresaste. Reporta este mensaje al equipo técnico.";
  }
  if (code === "23505") {
    return "Ya existe un registro con ese valor. Revisa el identificador o el nombre de bodega NetSuite.";
  }
  if (code === "P0001") return message;
  if (code === "42883") {
    return "La función que guarda los cambios no está disponible en la base de datos. Reporta este mensaje al equipo técnico.";
  }
  if (code === "42501" || message.toLowerCase().includes("permission denied")) {
    return "No tienes permisos para realizar esta acción.";
  }
  return message.slice(0, 200) || "Error desconocido.";
}

export function toastErrorUbicacion(error: unknown) {
  const original = String((error as any)?.message ?? "");
  toast.error("No se pudo guardar la ubicación", {
    description: traducirErrorSupabase(error),
    duration: 8000,
    action: {
      label: "Copiar detalle",
      onClick: () => {
        navigator.clipboard?.writeText(original).then(
          () => toast.success("Detalle copiado"),
          () => toast.error("No se pudo copiar"),
        );
      },
    },
  });
}
