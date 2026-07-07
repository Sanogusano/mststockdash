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

function parseFecha(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S))).toISOString();
    }
  }
  const s = String(value);
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

function parseNumero(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  let s = raw.replace(/[^\d,.-]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const decimals = s.length - lastComma - 1;
    s = decimals > 0 && decimals <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const decimals = s.length - lastDot - 1;
    if ((s.match(/\./g)?.length ?? 0) > 1 || decimals === 3) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
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

    const body = await req.json();
    const { archivo_base64, nombre_archivo, tipo, facturas_netsuite } = body;
    const netsuitePreprocesado = tipo === "netsuite" && Array.isArray(facturas_netsuite);
    if (!archivo_base64 && !netsuitePreprocesado) throw new Error("archivo_base64 requerido");

    let workbook: any = null;
    let primeraHoja: string | null = null;
    let tipoDetectado = tipo as string | undefined;

    if (!netsuitePreprocesado) {
      const binaryStr = atob(archivo_base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      workbook = XLSX.read(bytes, { type: "array" });
      primeraHoja = workbook.SheetNames[0];

      if (!tipoDetectado) {
        if (!primeraHoja) throw new Error("El archivo Excel no contiene hojas");
        const datosHeader = XLSX.utils.sheet_to_json(workbook.Sheets[primeraHoja], { header: 1 }) as any[];
        const headerRows = [0, 1]
          .map((idx) => ((datosHeader[idx] as unknown[]) ?? []).map((h) => String(h || "").trim()))
          .filter((row) => row.some(Boolean));
        const headers = headerRows.flat();
        if (headers.includes("ID Transacción") && headers.includes("Canal")) tipoDetectado = "addi_transacciones";
        else if (headers.includes("Id pedido") && headers.includes("Total a pagar")) tipoDetectado = "addi_liquidaciones";
        else if (headers.includes("# Factura") || headers.includes("numero_factura")) tipoDetectado = "netsuite";
      }
    }

    const resultado: any = { insertados: 0, actualizados: 0, sin_cruce: 0, errores: 0, tipo: tipoDetectado, total: 0 };

    // Helper: normaliza claves quitando acentos, saltos de línea, espacios extra y bajando a minúsculas
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");

    const normCompact = (s: string) => norm(s).replace(/[^a-z0-9]/g, "");

    if (tipoDetectado === "addi_transacciones") {
      if (!workbook || !primeraHoja) throw new Error("No se pudo leer el archivo Excel");
      // Detectar dinámicamente la fila de encabezados (buscar "ID Transacción" o "Canal").
      // Addi ha cambiado el formato: a veces headers en fila 0, a veces en fila 1.
      const sheetRef = workbook.Sheets[primeraHoja];
      const allRowsAddi = XLSX.utils.sheet_to_json(sheetRef, { header: 1, raw: false }) as any[][];
      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(allRowsAddi.length, 10); i++) {
        const row = (allRowsAddi[i] ?? []).map((c) => normCompact(String(c ?? "")));
        const hasIdTrans = row.some((c) => c === "idtransaccion" || c === "idtransacción" || c.includes("idtransac"));
        const hasCanal = row.some((c) => c === "canal");
        const hasEstado = row.some((c) => c === "estado" || c.includes("estadodelatransac"));
        if ((hasIdTrans && hasCanal) || (hasIdTrans && hasEstado) || (hasCanal && hasEstado)) {
          headerRowIdx = i;
          break;
        }
      }
      if (headerRowIdx < 0) {
        throw new Error("No se encontró fila de encabezados con 'ID Transacción'/'Canal'/'Estado' en el archivo Addi");
      }
      console.log("Addi header row index:", headerRowIdx);
      const rowsRaw = XLSX.utils.sheet_to_json(sheetRef, { range: headerRowIdx }) as any[];
      console.log("Total rows:", rowsRaw.length);
      console.log("Keys:", rowsRaw.length > 0 ? Object.keys(rowsRaw[0]).slice(0, 10) : []);

      // Re-mapear cada fila a claves normalizadas
      const rows = rowsRaw.map((r) => {
        const out: Record<string, any> = {};
        for (const k of Object.keys(r)) out[norm(k)] = r[k];
        return out;
      });

      const get = (r: any, ...keys: string[]) => {
        const entries = Object.entries(r);
        // 1) Exact match on normCompact key
        for (const k of keys) {
          const wanted = normCompact(k);
          const found = entries.find(([rk]) => normCompact(rk) === wanted);
          const v = found?.[1];
          if (v !== undefined && v !== null && String(v).trim() !== "") return v;
        }
        // 2) Partial match: header key contains wanted (avoid the reverse direction
        //    which caused "Sub-estado" to swallow "Estado" lookups).
        for (const k of keys) {
          const wanted = normCompact(k);
          const found = entries.find(([rk]) => normCompact(rk).includes(wanted));
          const v = found?.[1];
          if (v !== undefined && v !== null && String(v).trim() !== "") return v;
        }
        return null;
      };

      // Diagnóstico: encabezados detectados y conteo por estado
      const headersDetect = rowsRaw.length ? Object.keys(rowsRaw[0]) : [];
      const estadosCount: Record<string, number> = {};
      for (const r of rows) {
        const e = String(get(r, "Estado de la transacción", "Estado") ?? "vacio").trim();
        estadosCount[e] = (estadosCount[e] ?? 0) + 1;
      }
      console.log("Headers:", headersDetect);
      console.log("Estados encontrados:", estadosCount);
      console.log("Total filas hoja:", rows.length);
      resultado.diagnostico = { headers: headersDetect, estadosCount, totalFilas: rows.length };

      const records = rows
        .map((r) => {
          const canalRaw = String(get(r, "Canal", "Nombre del aliado", "Nombre tienda") ?? "").trim();
          const nombreTienda = get(r, "Nombre tienda", "Nombre Tienda");
          const idOrden = get(r, "ID Orden", "Id Orden", "Id pedido", "ID pedido");
          const idTransaccion = get(r, "ID Transacción", "ID Transaccion", "Id Transaccion", "ID Operación", "ID Operacion");
          const estado = get(r, "Estado de la transacción", "Estado");
          const tipoVenta = get(r, "Tipo de venta");
          const canal = canalRaw.toUpperCase() === "ADDI" && String(nombreTienda ?? "").toUpperCase().includes("MARKETPLACE")
            ? "ADDI_MARKETPLACE"
            : canalRaw;
          return {
            id_transaccion: String(idTransaccion ?? ""),
            cc: get(r, "CC", "Número de documento", "Numero de documento") != null ? String(get(r, "CC", "Número de documento", "Numero de documento")) : null,
            nombre_cliente: get(r, "Nombre Cliente") ? String(get(r, "Nombre Cliente")) : null,
            monto: parseNumero(get(r, "Monto", "Total Ventas", "Total Ventas (1)", "Total a pagar")),
            tipo_de_venta: tipoVenta ? String(tipoVenta) : null,
            fecha_creacion: parseFecha(get(r, "Fecha Creación", "Fecha Creacion", "Fecha de venta")),
            canal: canal ? String(canal) : null,
            estado: estado ? String(estado) : null,
            sub_estado: get(r, "Sub-estado", "Sub estado", "SubEstado") ? String(get(r, "Sub-estado", "Sub estado", "SubEstado")) : null,
            nombre_tienda: nombreTienda ? String(nombreTienda) : null,
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
    } else if (tipoDetectado === "netsuite") {
      let facturas: any[] = [];
      let filasProcesadas = 0;
      let headerIdx = -1;

      if (netsuitePreprocesado) {
        facturas = facturas_netsuite
          .map((f: any) => ({
            numero_factura: String(f.numero_factura ?? "").trim(),
            fecha_factura: f.fecha_factura || null,
            ubicacion_netsuite: f.ubicacion_netsuite || null,
            vendedor: f.vendedor || null,
            cliente_nombre: f.cliente_nombre || null,
            cliente_documento: f.cliente_documento || null,
            numero_pos: f.numero_pos || null,
            shopify_order_number: f.shopify_order_number ? String(f.shopify_order_number).replace(/\.0$/, "").trim() : null,
            cufe: f.cufe || null,
            valor_facturado: Math.round(parseNumero(f.valor_facturado) * 100) / 100,
            origen: "shopify",
            creado_por: userEmail ?? "manual",
          }))
          .filter((f: any) => f.numero_factura);
        filasProcesadas = Number(body?.diagnostico?.filas_procesadas ?? facturas.length);
      } else {
        if (!workbook || !primeraHoja) throw new Error("No se pudo leer el archivo Excel");
        // Encabezados en fila 6 (índice 6), datos desde fila 7. Detectar dinámicamente
        // la fila que contenga "Ubicación: Nombre" para robustez.
      const allRows = XLSX.utils.sheet_to_json(workbook.Sheets[primeraHoja], { header: 1, raw: true }) as any[][];
      headerIdx = -1;
      for (let i = 0; i < Math.min(allRows.length, 20); i++) {
        const row = (allRows[i] ?? []).map((c) => String(c ?? "").trim());
        if (row.some((c) => norm(c).includes("ubicacion: nombre") || norm(c) === "ubicacion nombre")) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx < 0) throw new Error("No se encontró fila de encabezados (Ubicación: Nombre) en el archivo NetSuite");

      const headerRow = (allRows[headerIdx] ?? []).map((c) => String(c ?? "").trim());
      const colIdx = (...keys: string[]) => {
        for (const k of keys) {
          const want = normCompact(k);
          const idx = headerRow.findIndex((h) => normCompact(h) === want);
          if (idx >= 0) return idx;
        }
        for (const k of keys) {
          const want = normCompact(k);
          const idx = headerRow.findIndex((h) => normCompact(h).includes(want));
          if (idx >= 0) return idx;
        }
        return -1;
      };

      const cUbic = colIdx("Ubicación: Nombre", "Ubicacion: Nombre");
      const cVendedor = colIdx("Vendedor");
      const cClienteFact = colIdx("Nombre para facturación electrónica", "Nombre para facturacion electronica");
      const cClienteTrabajo = colIdx("Cliente:Trabajo", "Cliente Trabajo");
      const cNumDoc = colIdx("Número de documento", "Numero de documento");
      const cResDian = colIdx("Número de Resolución DIAN", "Numero de Resolucion DIAN");
      const cFecha = colIdx("Fecha");
      const cCantidad = colIdx("Cantidad");
      const cDescuento = colIdx("Descuento");
      const cIngresos = colIdx("Ingresos totales");
      const cOC = colIdx("Número de OC", "Numero de OC");
      const cCufe = colIdx("CUFE");

      // Agrupar líneas por numero_factura (Número de documento) para tener una fila por factura
      type Acc = {
        numero_factura: string;
        fecha_factura: string | null;
        ubicacion_netsuite: string | null;
        vendedor: string | null;
        cliente_nombre: string | null;
        cliente_documento: string | null;
        numero_pos: string | null;
        shopify_order_number: string | null;
        cufe: string | null;
        valor_facturado: number;
      };
      const map = new Map<string, Acc>();
      for (let r = headerIdx + 1; r < allRows.length; r++) {
        const row = allRows[r] ?? [];
        if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;
        const numDoc = String(row[cNumDoc] ?? "").trim();
        if (!numDoc) continue;
        filasProcesadas++;

        const ingresos = parseNumero(row[cIngresos]);
        // Cliente:Trabajo suele venir "Nombre 1234567890" → separar NIT al final
        const clienteTrabajo = String(row[cClienteTrabajo] ?? "").trim();
        const m = clienteTrabajo.match(/^(.*?)[\s]+(\d{5,})$/);
        const cliNombre = m ? m[1].trim() : (String(row[cClienteFact] ?? "").trim() || clienteTrabajo || null);
        const cliDoc = m ? m[2] : null;

        const fechaRaw = row[cFecha];
        const fecha = parseFecha(fechaRaw);

        const oc = row[cOC];
        const ocStr = oc !== null && oc !== undefined && String(oc).trim() !== "" ? String(oc).replace(/\.0$/, "").trim() : null;

        const prev = map.get(numDoc);
        if (prev) {
          prev.valor_facturado += ingresos;
          if (!prev.shopify_order_number && ocStr) prev.shopify_order_number = ocStr;
        } else {
          map.set(numDoc, {
            numero_factura: numDoc,
            fecha_factura: fecha ? fecha.substring(0, 10) : null,
            ubicacion_netsuite: String(row[cUbic] ?? "").trim() || null,
            vendedor: String(row[cVendedor] ?? "").trim() || null,
            cliente_nombre: cliNombre || null,
            cliente_documento: cliDoc,
            numero_pos: String(row[cResDian] ?? "").trim() || null,
            shopify_order_number: ocStr,
            cufe: String(row[cCufe] ?? "").trim() || null,
            valor_facturado: ingresos,
          });
        }
      }

      facturas = Array.from(map.values()).map((f) => ({
        ...f,
        valor_facturado: Math.round(f.valor_facturado * 100) / 100,
        origen: "shopify",
        creado_por: userEmail ?? "manual",
      }));
      }

      resultado.total = facturas.length;
      resultado.diagnostico = { filas_procesadas: filasProcesadas, facturas_agregadas: facturas.length, headerIdx };

      // Cruce con Shopify antes de insertar: evita actualizaciones fila a fila y no toca
      // `discrepancia`, porque en DB es una columna generada.
      const orderNums = Array.from(new Set(facturas.map((f) => f.shopify_order_number).filter(Boolean) as string[]));
      const ordersMap = new Map<string, { shopify_order_id: string; total_price: number }>();
      for (let i = 0; i < orderNums.length; i += 200) {
        const slice = orderNums.slice(i, i + 200);
        const { data: ordRows, error: ordErr } = await supabase
          .from("orders")
          .select("order_number,shopify_order_id,total_price")
          .in("order_number", slice);
        if (ordErr) { console.error("Orders lookup error:", ordErr); continue; }
        for (const o of ordRows ?? []) {
          ordersMap.set(String((o as any).order_number), {
            shopify_order_id: String((o as any).shopify_order_id),
            total_price: Number((o as any).total_price ?? 0),
          });
        }
      }

      let sinCruce = 0;
      facturas = facturas.map((f) => {
        if (!f.shopify_order_number) { sinCruce++; return f; }
        const match = ordersMap.get(f.shopify_order_number);
        if (!match) { sinCruce++; return f; }
        const diferencia = Math.round((f.valor_facturado - match.total_price) * 100) / 100;
        return {
          ...f,
          shopify_order_id: match.shopify_order_id,
          valor_shopify: match.total_price,
          tipo_discrepancia: Math.abs(diferencia) < 1 ? "sin_discrepancia" : (diferencia > 0 ? "mayor_valor" : "menor_valor"),
        };
      });
      resultado.sin_cruce = sinCruce;

      // Borrar facturas previas con esos números (idempotencia) y reinsertar
      const numeros = facturas.map((f) => f.numero_factura);
      for (let i = 0; i < numeros.length; i += 200) {
        const slice = numeros.slice(i, i + 200);
        const { error: delErr } = await supabase.from("netsuite_facturas").delete().in("numero_factura", slice);
        if (delErr) console.error("Delete batch error:", delErr);
      }
      for (let i = 0; i < facturas.length; i += 200) {
        const batch = facturas.slice(i, i + 200);
        const { error } = await supabase.from("netsuite_facturas").insert(batch);
        if (error) {
          console.error("Insert netsuite error:", error);
          resultado.errores += batch.length;
        } else {
          resultado.insertados += batch.length;
        }
      }
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
