import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const meses: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
};

function parseFecha(s: string): string | null {
  if (!s) return null;
  const lower = s.toLowerCase().trim();
  const m = lower.match(/(\d+)\s+(\w+)\s+(\d+),\s+(\d+):(\d+)\s+(a\.|p\.)\s*m\..*gmt([+-]\d+)/);
  if (m) {
    const [, dia, mes, anio, hora, mins, ampm, tz] = m;
    let h = parseInt(hora);
    if (ampm === "p." && h !== 12) h += 12;
    if (ampm === "a." && h === 12) h = 0;
    const mesNum = meses[mes.substring(0, 3)] || 1;
    return `${anio}-${String(mesNum).padStart(2, "0")}-${String(parseInt(dia)).padStart(2, "0")}T${String(h).padStart(2, "0")}:${mins}:00${tz}:00`;
  }
  // Fallback: try Date.parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // Validar JWT del usuario
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;
    const userEmail = (claimsData.claims as any).email as string | undefined;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { archivo_base64, nombre_archivo, tipo } = await req.json();
    if (!archivo_base64) throw new Error("archivo_base64 requerido");

    const binaryStr = atob(archivo_base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const workbook = XLSX.read(bytes, { type: "array" });
    const primeraHoja = workbook.SheetNames[0];
    const datosHeader = XLSX.utils.sheet_to_json(workbook.Sheets[primeraHoja], { header: 1 }) as any[];
    const headers = ((datosHeader[0] as string[]) ?? []).map((h) => String(h || "").trim());

    let tipoDetectado = tipo as string | undefined;
    if (!tipoDetectado) {
      if (headers.includes("ID Transacción") && headers.includes("Canal")) tipoDetectado = "addi_transacciones";
      else if (headers.includes("Id pedido") && headers.includes("Total a pagar")) tipoDetectado = "addi_liquidaciones";
      else if (headers.includes("# Factura") || headers.includes("numero_factura")) tipoDetectado = "netsuite";
    }

    const resultado: any = { insertados: 0, actualizados: 0, sin_cruce: 0, errores: 0, tipo: tipoDetectado, total: 0 };

    // Helper: normaliza claves quitando acentos, espacios extra y bajando a minúsculas
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");

    if (tipoDetectado === "addi_transacciones") {
      // Headers están en fila 1 (índice 1), no en fila 0. Datos arrancan en fila 2.
      const rowsRaw = XLSX.utils.sheet_to_json(workbook.Sheets[primeraHoja], { range: 1 }) as any[];
      console.log("Total rows:", rowsRaw.length);
      console.log("Keys:", rowsRaw.length > 0 ? Object.keys(rowsRaw[0]).slice(0, 10) : []);

      // Re-mapear cada fila a claves normalizadas
      const rows = rowsRaw.map((r) => {
        const out: Record<string, any> = {};
        for (const k of Object.keys(r)) out[norm(k)] = r[k];
        return out;
      });

      const get = (r: any, ...keys: string[]) => {
        for (const k of keys) {
          const v = r[norm(k)];
          if (v !== undefined && v !== null && String(v).trim() !== "") return v;
        }
        return null;
      };

      // Diagnóstico: encabezados detectados y conteo por estado
      const headersDetect = rowsRaw.length ? Object.keys(rowsRaw[0]) : [];
      const estadosCount: Record<string, number> = {};
      for (const r of rows) {
        const e = String(get(r, "Estado") ?? "vacio").trim();
        estadosCount[e] = (estadosCount[e] ?? 0) + 1;
      }
      console.log("Headers:", headersDetect);
      console.log("Estados encontrados:", estadosCount);
      console.log("Total filas hoja:", rows.length);
      resultado.diagnostico = { headers: headersDetect, estadosCount, totalFilas: rows.length };

      const records = rows
        .filter((r) => {
          // Buscar columna que contenga "transacci" o "estado" en su nombre
          const entry = Object.entries(r).find(([k]) => {
            const kl = k.toLowerCase();
            return kl.includes("transacci") || kl.includes("estado");
          });
          const val = String(entry?.[1] ?? "");
          return val.startsWith("Transacci");
        })
        .map((r) => {
          const canal = get(r, "Canal");
          const idOrden = get(r, "ID Orden", "Id Orden");
          return {
            id_transaccion: String(get(r, "ID Transacción", "ID Transaccion", "Id Transaccion") ?? ""),
            cc: get(r, "CC") != null ? String(get(r, "CC")) : null,
            nombre_cliente: get(r, "Nombre Cliente") ? String(get(r, "Nombre Cliente")) : null,
            monto: parseFloat(String(get(r, "Monto") ?? "0")) || 0,
            tipo_de_venta: get(r, "Tipo de venta") ? String(get(r, "Tipo de venta")) : null,
            fecha_creacion: parseFecha(String(get(r, "Fecha Creación", "Fecha Creacion") ?? "")),
            canal: canal ? String(canal) : null,
            estado: get(r, "Estado") ? String(get(r, "Estado")) : null,
            sub_estado: get(r, "Sub-estado", "Sub estado", "SubEstado") ? String(get(r, "Sub-estado", "Sub estado", "SubEstado")) : null,
            nombre_tienda: get(r, "Nombre Tienda") ? String(get(r, "Nombre Tienda")) : null,
            id_credito: get(r, "ID Crédito", "ID Credito") ? String(get(r, "ID Crédito", "ID Credito")) : null,
            email_vendedor: get(r, "Email vendedor", "Email Vendedor") ? String(get(r, "Email vendedor", "Email Vendedor")) : null,
            id_orden: idOrden ? String(idOrden) : null,
            shopify_order_id: canal === "PAY_LINK" && idOrden ? String(idOrden) : null,
          };
        })
        .filter((r) => r.id_transaccion);

      resultado.total = records.length;

      for (let i = 0; i < records.length; i += 100) {
        const batch = records.slice(i, i + 100);
        const { error } = await supabase
          .from("addi_transactions")
          .upsert(batch, { onConflict: "id_transaccion", ignoreDuplicates: false });
        if (error) {
          console.error("Upsert error:", error);
          resultado.errores += batch.length;
        } else {
          resultado.insertados += batch.length;
        }
      }

      const { error: rpcErr } = await supabase.rpc("cruzar_addi_con_shopify");
      if (rpcErr) console.error("RPC cruzar error:", rpcErr);

      const { count } = await supabase
        .from("addi_transactions")
        .select("*", { count: "exact", head: true })
        .eq("canal", "E_COMMERCE_SHOPIFY")
        .is("shopify_order_id", null);
      resultado.sin_cruce = count || 0;
    } else {
      throw new Error(`Tipo no soportado todavía: ${tipoDetectado ?? "desconocido"}`);
    }

    // Registrar historial
    const cruzados = Math.max(0, resultado.insertados - resultado.sin_cruce);
    await supabase.from("addi_upload_history").insert({
      uploaded_by: userId,
      uploaded_by_email: userEmail ?? null,
      nombre_archivo: nombre_archivo ?? "archivo.xlsx",
      tipo: tipoDetectado ?? "desconocido",
      total_registros: resultado.total,
      cruzados,
      sin_cruce: resultado.sin_cruce,
      errores: resultado.errores,
      detalle: resultado,
    });

    return new Response(JSON.stringify(resultado), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error procesando archivo:", err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
