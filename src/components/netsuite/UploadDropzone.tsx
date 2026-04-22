import { useCallback, useRef, useState } from "react";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  parseNetsuiteXls,
  type NetsuiteSnapshotData,
} from "@/lib/parse-netsuite-xls";
import { findUnmappedLocations } from "@/lib/snapshot-api";

interface Props {
  onParsed: (data: NetsuiteSnapshotData) => void;
  disabled?: boolean;
}

export function UploadDropzone({ onParsed, disabled }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".xls")) {
        toast.error("El archivo debe tener extensión .xls (XML Spreadsheet 2003)");
        return;
      }
      setIsParsing(true);
      try {
        const data = await parseNetsuiteXls(file);

        // Detectar ubicaciones no mapeadas
        const unmapped = await findUnmappedLocations(data.uniqueLocationNames);
        if (unmapped.length > 0) {
          data.warnings.push(
            `${unmapped.length} ubicación(es) del archivo no están mapeadas en el sistema. Sus datos se guardarán pero no entrarán al allocation hasta que las mapees.`
          );
          (data as any).unmappedLocations = unmapped;
        }

        toast.success(
          `Archivo parseado: ${data.totalSkus.toLocaleString()} SKUs, ${data.totalUnits.toLocaleString()} unidades`
        );
        onParsed(data);
      } catch (err: any) {
        toast.error(err?.message ?? "Error al parsear el archivo");
      } finally {
        setIsParsing(false);
      }
    },
    [onParsed]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isParsing) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled && !isParsing) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      onClick={() => !disabled && !isParsing && inputRef.current?.click()}
      className={cn(
        "border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50 hover:bg-muted/30",
        (disabled || isParsing) && "opacity-60 cursor-not-allowed"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      {isParsing ? (
        <>
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <p className="text-sm font-medium">Parseando archivo...</p>
          <p className="text-xs text-muted-foreground">
            Esto puede tardar 5-15 segundos para archivos grandes
          </p>
        </>
      ) : (
        <>
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">
              Arrastra el archivo .xls de NetSuite
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              o haz clic para seleccionar
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>
              Formato: XML Spreadsheet 2003 — reporte "Inventario Disponible por
              Ubicación"
            </span>
          </div>
        </>
      )}
    </div>
  );
}
