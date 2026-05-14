import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.4.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZENVIA_FROM = "5753162974";
const TEMPLATE_ID = "6c01558a-c76a-42da-b41f-71619b0f3261";

// ─── FECHA BOGOTÁ ─────────────────────────────────────────────────────────────
function fechaBogota(): string {
  // YYYY-MM-DD en zona America/Bogota (UTC-5, sin DST)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ─── WASM + FONT ──────────────────────────────────────────────────────────────
let wasmReady = false;
let fontBuffer: Uint8Array | undefined;
let fontBase64: string | undefined;

async function ensureReady() {
  if (!wasmReady) {
    const wasm = await fetch("https://esm.sh/@resvg/resvg-wasm@2.4.1/index_bg.wasm");
    await initWasm(wasm);
    wasmReady = true;
    console.log("WASM OK");
  }
  if (!fontBuffer) {
    const urls = [
      "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf",
      "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSans/hinted/ttf/NotoSans-Bold.ttf",
    ];
    for (const url of urls) {
      try {
        const r = await fetch(url);
        if (r.ok) {
          const buf = new Uint8Array(await r.arrayBuffer());
          if (!fontBuffer) fontBuffer = buf;
          console.log("Font OK:", url.split("/").pop(), buf.length);
        }
      } catch (_e) {
        console.warn("Font fail:", url);
      }
    }
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function cop(n: number): string {
  if (!n || isNaN(n)) return "$ -";
  return "$ " + Math.round(n).toLocaleString("es-CO");
}
function pct(n: number): string { return `${(n || 0).toFixed(0)}%`; }
function num(n: number): string { return n ? Math.round(n).toString() : "-"; }

// ─── SVG ESTILO EXCEL ─────────────────────────────────────────────────────────
function generarSVG(data: any, fontBase64?: string): string {
  const { fecha, tiendas, digital, personal_shopper, dias_mes: dm } = data;

  const MESES = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  const fObj = new Date(fecha + "T12:00:00");
  const titulo = `VENTAS Y CUMPLIMIENTO ${fObj.getDate()}-${MESES[fObj.getMonth()]}`;

  const W = 780;
  const COL = { canal: 0, venta: 220, pptoDia: 355, cumpl: 480, unidades: 620 };
  const COL_W = { canal: 220, venta: 135, pptoDia: 125, cumpl: 140, unidades: 130 };
  const RH = 24;
  const BORDER = "#aaaaaa";
  const HEADER_BG = "#d9d9d9";
  const TOTAL_BG = "#b8b8b8";
  const SUBTOTAL_BG = "#d9d9d9";
  const WHITE = "#ffffff";
  const BLACK = "#000000";
  const DARK = "#1a1a1a";

  const z1 = tiendas.filter((t: any) => t.zona === "Zona 1");
  const z2 = tiendas.filter((t: any) => t.zona === "Zona 2");
  const sum = (arr: any[], key: string) => arr.reduce((s: number, t: any) => s + (t[key] || 0), 0);

  const hoyZ1 = sum(z1, "venta_hoy"), unZ1 = sum(z1, "unidades_hoy");
  const pptoZ1 = sum(z1, "presupuesto_mes"), cumplZ1 = pptoZ1 > 0 ? (sum(z1, "venta_acumulada") / pptoZ1) * 100 : 0;
  const pptoDiaZ1 = pptoZ1 / dm;

  const hoyZ2 = sum(z2, "venta_hoy"), unZ2 = sum(z2, "unidades_hoy");
  const pptoZ2 = sum(z2, "presupuesto_mes"), cumplZ2 = pptoZ2 > 0 ? (sum(z2, "venta_acumulada") / pptoZ2) * 100 : 0;
  const pptoDiaZ2 = pptoZ2 / dm;

  const hoyT = hoyZ1 + hoyZ2, unT = unZ1 + unZ2;
  const pptoT = pptoZ1 + pptoZ2, pptoDiaT = pptoT / dm;
  const acumT = sum(tiendas, "venta_acumulada");
  const cumplT = pptoT > 0 ? (acumT / pptoT) * 100 : 0;

  const hoyOnline = digital?.venta_hoy || 0, unOnline = digital?.unidades_hoy || 0;
  const pptoOnline = digital?.presupuesto_mes || 0, cumplOnline = digital?.cumplimiento || 0;
  const hoyPS = personal_shopper?.venta_hoy || 0, unPS = personal_shopper?.unidades_hoy || 0;
  const pptoPS = personal_shopper?.presupuesto_mes || 0, cumplPS = personal_shopper?.cumplimiento || 0;

  const hoyD = hoyOnline + hoyPS, unD = unOnline + unPS;
  const pptoD = pptoOnline + pptoPS, pptoDiaD = pptoD / dm;
  const acumD = (digital?.venta_acumulada || 0) + (personal_shopper?.venta_acumulada || 0);
  const cumplD = pptoD > 0 ? (acumD / pptoD) * 100 : 0;

  const hoyVD = hoyT + hoyD, unVD = unT + unD;

  let y = 0;
  const rows: string[] = [];

  function cell(x: number, cy: number, w: number, h: number, text: string,
    opts: { bg?: string; bold?: boolean; align?: string; color?: string; size?: number } = {}): string {
    const bg = opts.bg || WHITE;
    const fw = opts.bold ? "bold" : "normal";
    const fs = opts.size || 11;
    const fc = opts.color || DARK;
    let tx: number, anchor: string;
    if (opts.align === "center") { tx = x + w / 2; anchor = "middle"; }
    else if (opts.align === "right") { tx = x + w - 6; anchor = "end"; }
    else { tx = x + 5; anchor = "start"; }
    return `<rect x="${x}" y="${cy}" width="${w}" height="${h}" fill="${bg}" stroke="${BORDER}" stroke-width="0.5"/>
<text x="${tx}" y="${cy + h * 0.65}" font-family="Noto Sans" font-size="${fs}" font-weight="${fw}" fill="${fc}" text-anchor="${anchor}">${text}</text>`;
  }

  function row(label: string, venta: number, pptoDia: number, cumplimiento: number,
    unidades: number, opts: { bg?: string; bold?: boolean } = {}): string {
    const h = RH;
    const cy = y;
    y += h;
    const cumplStr = pptoDia > 0 ? pct(cumplimiento) : "";
    return [
      cell(COL.canal, cy, COL_W.canal, h, label, { bg: opts.bg, bold: opts.bold }),
      cell(COL.venta, cy, COL_W.venta, h, venta > 0 ? cop(venta) : "$ -", { bg: opts.bg, bold: opts.bold, align: "right" }),
      cell(COL.pptoDia, cy, COL_W.pptoDia, h, pptoDia > 0 ? cop(pptoDia) : "$ -", { bg: opts.bg, align: "right" }),
      cell(COL.cumpl, cy, COL_W.cumpl, h, cumplStr, { bg: opts.bg, bold: opts.bold, align: "center" }),
      cell(COL.unidades, cy, COL_W.unidades - 10, h, num(unidades), { bg: opts.bg, bold: opts.bold, align: "center" }),
    ].join("\n");
  }

  const tH = 28;
  rows.push(`<rect x="0" y="${y}" width="${W}" height="${tH}" fill="${HEADER_BG}" stroke="${BORDER}" stroke-width="0.5"/>
<text x="${W / 2}" y="${y + tH * 0.68}" font-family="Noto Sans" font-size="13" font-weight="bold" fill="${BLACK}" text-anchor="middle">${titulo}</text>`);
  y += tH;

  const hH = 30;
  rows.push([
    cell(COL.canal, y, COL_W.canal, hH, "CANAL", { bg: HEADER_BG, bold: true, align: "center" }),
    cell(COL.venta, y, COL_W.venta, hH, "VENTA", { bg: HEADER_BG, bold: true, align: "center" }),
    cell(COL.pptoDia, y, COL_W.pptoDia, hH, "PRESUPUESTO DÍA", { bg: HEADER_BG, bold: true, align: "center", size: 10 }),
    cell(COL.cumpl, y, COL_W.cumpl, hH, "CUMPLIMIENTO", { bg: HEADER_BG, bold: true, align: "center" }),
    cell(COL.unidades, y, COL_W.unidades - 10, hH, "UNIDADES", { bg: HEADER_BG, bold: true, align: "center" }),
  ].join("\n"));
  y += hH;

  z1.forEach((t: any) => {
    const nombre = t.tienda.replace(/^Tienda\s+/i, "").toUpperCase();
    const pptoDia = (t.presupuesto_mes || 0) / dm;
    const cumplDia = pptoDia > 0 ? ((t.venta_hoy || 0) / pptoDia) * 100 : 0;
    rows.push(row(nombre, t.venta_hoy || 0, pptoDia, cumplDia, t.unidades_hoy || 0));
  });
  rows.push(row("TOTAL TIENDAS ZONA 1", hoyZ1, pptoDiaZ1, cumplZ1, unZ1, { bg: TOTAL_BG, bold: true }));

  z2.forEach((t: any) => {
    const nombre = t.tienda.replace(/^Tienda\s+/i, "").toUpperCase();
    const pptoDia = (t.presupuesto_mes || 0) / dm;
    const cumplDia = pptoDia > 0 ? ((t.venta_hoy || 0) / pptoDia) * 100 : 0;
    rows.push(row(nombre, t.venta_hoy || 0, pptoDia, cumplDia, t.unidades_hoy || 0));
  });
  rows.push(row("TOTAL TIENDAS ZONA 2", hoyZ2, pptoDiaZ2, cumplZ2, unZ2, { bg: TOTAL_BG, bold: true }));
  rows.push(row("TOTAL TIENDAS COLOMBIA", hoyT, pptoDiaT, cumplT, unT, { bg: SUBTOTAL_BG, bold: true }));

  rows.push(row("PERSONAL SHOPPER", hoyPS, pptoPS / dm, cumplPS, unPS));
  rows.push(row("SHOPIFY COLOMBIA", hoyOnline, pptoOnline / dm, cumplOnline, unOnline));
  rows.push(row("TOTAL DIGITAL COLOMBIA", hoyD, pptoDiaD, cumplD, unD, { bg: TOTAL_BG, bold: true }));

  const totalH = 32;
  const cy = y;
  rows.push(`<rect x="0" y="${cy}" width="${W}" height="${totalH}" fill="${SUBTOTAL_BG}" stroke="${BORDER}" stroke-width="0.5"/>
<text x="8" y="${cy + totalH * 0.65}" font-family="Noto Sans" font-size="12" font-weight="bold" fill="${BLACK}">TOTAL VENTA DIRECTA DÍA</text>
<text x="${COL.venta + COL_W.venta - 6}" y="${cy + totalH * 0.65}" font-family="Noto Sans" font-size="13" font-weight="bold" fill="${BLACK}" text-anchor="end">${cop(hoyVD)}</text>
<text x="${COL.unidades + (COL_W.unidades - 10) / 2}" y="${cy + totalH * 0.65}" font-family="Noto Sans" font-size="12" font-weight="bold" fill="${BLACK}" text-anchor="middle">${num(unVD)}</text>`);
  y += totalH;

  y += 6;
  rows.push(`<text x="${W / 2}" y="${y + 12}" font-family="Noto Sans" font-size="9" fill="#666666" text-anchor="middle">Selliq BI · Monastery Couture · ${fecha}</text>`);
  y += 18;

  const fontEmbed = fontBase64 ? `
  <defs>
    <style>
      @font-face {
        font-family: 'Noto Sans';
        src: url('data:font/ttf;base64,${fontBase64}') format('truetype');
        font-weight: normal;
      }
    </style>
  </defs>` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${y}" xmlns="http://www.w3.org/2000/svg">
${fontEmbed}
<rect width="${W}" height="${y}" fill="white"/>
${rows.join("\n")}
</svg>`;
}

// ─── TEXTO FALLBACK ───────────────────────────────────────────────────────────
function generarTexto(d: any): string {
  const { fecha, tiendas, digital, personal_shopper, dias_transcurridos: dt, dias_mes: dm } = d;
  const MESES = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  const fObj = new Date(fecha + "T12:00:00");
  const z1 = tiendas.filter((t: any) => t.zona === "Zona 1");
  const z2 = tiendas.filter((t: any) => t.zona === "Zona 2");
  const sum = (arr: any[], k: string) => arr.reduce((s: number, t: any) => s + (t[k] || 0), 0);

  const cop = (n: number) => {
    if (!n || n === 0) return "$0";
    return "$" + Math.round(n).toLocaleString("es-CO");
  };

  const sem = (c: number) => {
    const pctT = (dt / dm) * 100;
    const diff = c - pctT;
    if (diff >= 5) return "🟢";
    if (diff >= -5) return "🟡";
    return "🔴";
  };

  const upt = (unidades: number, ordenes: number) =>
    ordenes > 0 ? (unidades / ordenes).toFixed(2) : "0.00";

  const cumplFecha = (acum: number, ppto: number) =>
    ppto > 0 ? ((acum / (ppto * dt / dm)) * 100).toFixed(1) + "%" : "-";

  const cumplGral = (acum: number, ppto: number) =>
    ppto > 0 ? ((acum / ppto) * 100).toFixed(1) + "%" : "-";

  let msg = `📊 *VENTAS ${fObj.getDate()}-${MESES[fObj.getMonth()]} · Día ${dt}/${dm}*\n\n`;
  msg += "```\n";
  msg += `TIENDA              | VENTA DÍA    | UND | C.FECHA | C.GRAL | UPT\n`;
  msg += `${"─".repeat(65)}\n`;

  const fila = (nombre: string, ventaHoy: number, unHoy: number,
                ordHoy: number, acum: number, ppto: number) => {
    const n = nombre.substring(0, 18).padEnd(18);
    const v = cop(ventaHoy).padStart(12);
    const u = (unHoy || 0).toString().padStart(3);
    const cf = cumplFecha(acum, ppto).padStart(7);
    const cg = cumplGral(acum, ppto).padStart(6);
    const up = upt(unHoy, ordHoy).padStart(5);
    const s = sem(ppto > 0 ? (acum / ppto) * 100 : 0);
    return `${s}${n}|${v} |${u}  |${cf}  |${cg}  |${up}\n`;
  };

  msg += `📍 ZONA 1\n`;
  z1.forEach((t: any) => {
    const nom = t.tienda.replace(/^Tienda\s+/i, "").toUpperCase();
    msg += fila(nom, t.venta_hoy || 0, t.unidades_hoy || 0,
                t.ordenes_hoy || 0, t.venta_acumulada || 0, t.presupuesto_mes || 0);
  });
  const totZ1Hoy = sum(z1, "venta_hoy"), totZ1Un = sum(z1, "unidades_hoy");
  const totZ1Ord = sum(z1, "ordenes_hoy"), totZ1Acum = sum(z1, "venta_acumulada");
  const totZ1Ppto = sum(z1, "presupuesto_mes");
  msg += `${"─".repeat(65)}\n`;
  msg += fila("TOTAL ZONA 1", totZ1Hoy, totZ1Un, totZ1Ord, totZ1Acum, totZ1Ppto);

  msg += `\n📍 ZONA 2\n`;
  z2.forEach((t: any) => {
    const nom = t.tienda.replace(/^Tienda\s+/i, "").toUpperCase();
    msg += fila(nom, t.venta_hoy || 0, t.unidades_hoy || 0,
                t.ordenes_hoy || 0, t.venta_acumulada || 0, t.presupuesto_mes || 0);
  });
  const totZ2Hoy = sum(z2, "venta_hoy"), totZ2Un = sum(z2, "unidades_hoy");
  const totZ2Ord = sum(z2, "ordenes_hoy"), totZ2Acum = sum(z2, "venta_acumulada");
  const totZ2Ppto = sum(z2, "presupuesto_mes");
  msg += `${"─".repeat(65)}\n`;
  msg += fila("TOTAL ZONA 2", totZ2Hoy, totZ2Un, totZ2Ord, totZ2Acum, totZ2Ppto);

  msg += `\n🌐 DIGITAL\n`;
  msg += fila("SHOPIFY COLOMBIA", digital?.venta_hoy || 0, digital?.unidades_hoy || 0,
              digital?.ordenes_hoy || 0, digital?.venta_acumulada || 0, digital?.presupuesto_mes || 0);
  msg += fila("PERSONAL SHOPPER", personal_shopper?.venta_hoy || 0, personal_shopper?.unidades_hoy || 0,
              personal_shopper?.ordenes_hoy || 0, personal_shopper?.venta_acumulada || 0, personal_shopper?.presupuesto_mes || 0);

  const hoyVD = sum(tiendas, "venta_hoy") + (digital?.venta_hoy || 0) + (personal_shopper?.venta_hoy || 0);
  const unVD = sum(tiendas, "unidades_hoy") + (digital?.unidades_hoy || 0) + (personal_shopper?.unidades_hoy || 0);
  const ordVD = sum(tiendas, "ordenes_hoy") + (digital?.ordenes_hoy || 0) + (personal_shopper?.ordenes_hoy || 0);
  const acumVD = sum(tiendas, "venta_acumulada") + (digital?.venta_acumulada || 0) + (personal_shopper?.venta_acumulada || 0);
  const pptoVD = sum(tiendas, "presupuesto_mes") + (digital?.presupuesto_mes || 0) + (personal_shopper?.presupuesto_mes || 0);

  msg += `${"─".repeat(65)}\n`;
  msg += fila("TOTAL VTA DIRECTA", hoyVD, unVD, ordVD, acumVD, pptoVD);
  msg += "```\n";
  msg += `_Selliq BI · Monastery_`;
  return msg;
}

// ─── ZENVIA ───────────────────────────────────────────────────────────────────
async function enviarZenvia(token: string, to: string, msg: string, imgUrl?: string) {
  const send = async (contents: any[]) => {
    const res = await fetch("https://api.zenvia.com/v2/channels/whatsapp/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Token": token },
      body: JSON.stringify({ from: ZENVIA_FROM, to, contents }),
    });
    const data = await res.json().catch(() => ({}));
    console.log(`Zenvia ${to}: ${res.status} ${JSON.stringify(data).substring(0, 150)}`);
    return { ok: res.ok, status: res.status };
  };

  const r1 = await send([{
    type: "template",
    templateId: TEMPLATE_ID,
    fields: { imageUrl: imgUrl || "" },
  }]);
  await new Promise((r) => setTimeout(r, 2000));
  const r2 = await send([{ type: "text", text: msg }]);

  return { ok: r1.ok && r2.ok, paso1: r1.status, paso2: r2.status };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ZENVIA_TOKEN = Deno.env.get("ZENVIA_API_TOKEN") ?? "";
    if (!ZENVIA_TOKEN) throw new Error("ZENVIA_API_TOKEN no configurado");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Permite override desde el body para pruebas: { fecha: 'YYYY-MM-DD' }
    let fechaOverride: string | undefined;
    try {
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        if (body?.fecha && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) fechaOverride = body.fecha;
      }
    } catch (_e) { /* ignore */ }

    const fecha = fechaOverride ?? fechaBogota();
    console.log(`Fecha Bogotá usada: ${fecha} (UTC now: ${new Date().toISOString()})`);

    // 1. Datos — pasamos la fecha de Bogotá explícita
    const { data: raw, error } = await supabase.rpc("reporte_cumplimiento_whatsapp", { p_fecha: fecha });
    if (error) throw new Error(`RPC error: ${error.message}`);
    const reporte = Array.isArray(raw) ? raw[0]?.reporte_cumplimiento_whatsapp ?? raw[0] : raw;
    console.log("Fecha reporte:", reporte?.fecha, "Tiendas:", reporte?.tiendas?.length);

    // 2. Imagen
    let imageUrl: string | undefined;
    try {
      await ensureReady();
      const svgStr = generarSVG(reporte, fontBase64);
      const opts: any = {
        fitTo: { mode: "width", value: 780 },
        font: { loadSystemFonts: false, defaultFontFamily: "Noto Sans" },
      };
      const resvg = new Resvg(svgStr, opts);
      const png = resvg.render().asPng();

      const fileName = `reporte-${reporte.fecha}.png`;
      const { error: upErr } = await supabase.storage
        .from("reportes-whatsapp")
        .upload(fileName, png, { contentType: "image/png", upsert: true });

      if (!upErr) {
        const { data: urlData } = supabase.storage.from("reportes-whatsapp").getPublicUrl(fileName);
        imageUrl = urlData?.publicUrl;
        console.log("PNG OK:", imageUrl);
      } else {
        console.warn("Upload error:", upErr.message);
      }
    } catch (e: any) {
      console.warn("Imagen error:", e.message);
    }

    // 3. Destinatarios
    const { data: dests } = await supabase
      .from("whatsapp_destinatarios")
      .select("nombre,numero")
      .eq("activo", true);
    console.log("Destinatarios:", dests?.length || 0);

    // 4. Enviar
    const msg = generarTexto(reporte);
    const resultados = [];
    for (const d of (dests || [])) {
      const r = await enviarZenvia(ZENVIA_TOKEN, d.numero, msg, imageUrl);
      resultados.push({ nombre: d.nombre, numero: d.numero, ...r });
      await new Promise((res) => setTimeout(res, 1000));
    }

    return new Response(
      JSON.stringify({ success: true, fecha_solicitada: fecha, fecha_reporte: reporte?.fecha, imagen: imageUrl, resultados }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
