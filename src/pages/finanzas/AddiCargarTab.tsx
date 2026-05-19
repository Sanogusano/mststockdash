import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtInt } from "@/lib/finanzas-format";
import { toast } from "sonner";

type Resultado = {
  insertados: number;
  actualizados?: number;
  sin_cruce: number;
  errores: number;
  tipo?: string;
  total?: number;
};

type HistorialRow = {
  id: string;
  uploaded_at: string;
  uploaded_by_email: string | null;
  nombre_archivo: string;
  tipo: string;
  total_registros: number;
  cruzados: number;
  sin_cruce: number;
  errores: number;
};

type UploaderConfig = {
  tipo: string;
  titulo: string;
  descripcion: string;
  accept: string;
  acceptLabel: string;
  dropLabel: string;
  itemLabel: string; // p.ej. "transacciones", "facturas"
  accentClass: string; // tailwind border/bg on hover
};

const SECCIONES: UploaderConfig[] = [
  {
    tipo: "addi_transacciones",
    titulo: "Transacciones Addi",
    descripcion: "Archivo Excel de transacciones exportado desde el portal de Addi.",
    accept: ".xlsx,.xls",
    acceptLabel: ".xlsx, .xls",
    dropLabel: "Arrastra el archivo Excel de transacciones Addi aquí",
    itemLabel: "transacciones",
    accentClass: "hover:border-emerald-400 dragging:border-emerald-500",
  },
  {
    tipo: "addi_liquidaciones",
    titulo: "Liquidaciones Addi",
    descripcion: "Archivo Excel de liquidaciones (tarifas, retenciones y abonos) de Addi.",
    accept: ".xlsx,.xls",
    acceptLabel: ".xlsx, .xls",
    dropLabel: "Arrastra el archivo Excel de liquidaciones Addi aquí",
    itemLabel: "liquidaciones",
    accentClass: "hover:border-sky-400",
  },
  {
    tipo: "netsuite",
    titulo: "Archivo Oracle NetSuite",
    descripcion: "Archivo de ventas exportado desde Oracle/NetSuite (Ventas_Oracle_*.xlsx).",
    accept: ".xlsx",
    acceptLabel: ".xlsx",
    dropLabel: "Arrastra el archivo Excel de NetSuite aquí",
    itemLabel: "facturas",
    accentClass: "hover:border-indigo-400",
  },
];

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function UploaderCard({ cfg, onDone }: { cfg: UploaderConfig; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onSelect(f: File | null) {
    setResultado(null);
    setProgreso(0);
    setFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onSelect(f);
  }

  async function procesar() {
    if (!file) return;
    setProcesando(true);
    setProgreso(15);
    setResultado(null);
    try {
      const base64 = await fileToBase64(file);
      setProgreso(40);
      const { data, error } = await supabase.functions.invoke("procesar-archivo-financiero", {
        body: { archivo_base64: base64, nombre_archivo: file.name, tipo: cfg.tipo },
      });
      setProgreso(95);
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResultado(data as Resultado);
      toast.success(`${cfg.titulo}: archivo procesado correctamente`);
      onDone();
    } catch (e: any) {
      toast.error(`Error procesando ${cfg.titulo}: ${e.message ?? e}`);
    } finally {
      setProgreso(100);
      setProcesando(false);
    }
  }

  const cruzadas = resultado ? Math.max(0, resultado.insertados - resultado.sin_cruce) : 0;

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <p className="text-sm font-semibold">{cfg.titulo}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{cfg.descripcion}</p>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
            dragOver ? "border-primary bg-muted/40" : `border-muted-foreground/25 hover:bg-muted/30 ${cfg.accentClass}`
          }`}
        >
          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">{cfg.dropLabel}</p>
          <p className="text-xs text-muted-foreground mt-1">o haz clic para seleccionar</p>
          <p className="text-xs text-muted-foreground mt-2">Formatos aceptados: {cfg.acceptLabel}</p>
          <input
            ref={inputRef}
            type="file"
            accept={cfg.accept}
            className="hidden"
            onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
          />
        </div>

        {file && (
          <div className="flex items-center gap-3 border rounded-lg p-3">
            <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {fmtSize(file.size)} · {new Date(file.lastModified).toLocaleString("es-CO")}
              </p>
            </div>
            {!procesando && (
              <Button variant="ghost" size="icon" onClick={() => onSelect(null)}>
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button onClick={procesar} disabled={procesando} className="gap-2">
              {procesando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {procesando ? "Procesando..." : "Procesar archivo"}
            </Button>
          </div>
        )}

        {procesando && <Progress value={progreso} />}

        {resultado && (
          <div className="border rounded-lg p-4 space-y-2 bg-muted/20">
            <p className="text-sm font-semibold mb-2">Resumen del procesamiento</p>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{fmtInt(resultado.insertados)} {cfg.itemLabel} cargadas</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{fmtInt(cruzadas)} cruzadas con Shopify</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span>{fmtInt(resultado.sin_cruce)} sin cruce</span>
            </div>
            {resultado.errores > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <AlertCircle className="h-4 w-4 text-rose-600" />
                <span>{fmtInt(resultado.errores)} errores</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TabCargarArchivo() {
  const [historial, setHistorial] = useState<HistorialRow[]>([]);
  const [loadingHist, setLoadingHist] = useState(true);

  useEffect(() => { void cargarHistorial(); }, []);

  async function cargarHistorial() {
    setLoadingHist(true);
    const { data, error } = await (supabase as any)
      .from("addi_upload_history")
      .select("id,uploaded_at,uploaded_by_email,nombre_archivo,tipo,total_registros,cruzados,sin_cruce,errores")
      .order("uploaded_at", { ascending: false })
      .limit(50);
    if (error) toast.error(`Error cargando historial: ${error.message}`);
    setHistorial((data as HistorialRow[]) ?? []);
    setLoadingHist(false);
  }

  return (
    <div className="space-y-4">
      {SECCIONES.map((cfg) => (
        <UploaderCard key={cfg.tipo} cfg={cfg} onDone={() => void cargarHistorial()} />
      ))}

      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b">
            <p className="text-sm font-semibold">Historial de cargas</p>
          </div>
          {loadingHist ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : historial.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Sin cargas registradas.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase">
                  <tr className="text-left">
                    <th className="px-3 py-2">Fecha carga</th>
                    <th className="px-3 py-2">Archivo</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2 text-right">Registros</th>
                    <th className="px-3 py-2 text-right">Cruzados</th>
                    <th className="px-3 py-2 text-right">Sin cruce</th>
                    <th className="px-3 py-2 text-right">Errores</th>
                    <th className="px-3 py-2">Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((h) => (
                    <tr key={h.id} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(h.uploaded_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="px-3 py-2 font-medium truncate max-w-[260px]">{h.nombre_archivo}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{h.tipo}</Badge></td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtInt(h.total_registros)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{fmtInt(h.cruzados)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-700">{fmtInt(h.sin_cruce)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${h.errores > 0 ? "text-rose-700" : "text-muted-foreground"}`}>{fmtInt(h.errores)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{h.uploaded_by_email ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
