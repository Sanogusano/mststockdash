/** Fecha YYYY-MM-DD en hora de Bogotá. */
export const fechaBogotaISO = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
