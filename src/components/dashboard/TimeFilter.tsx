import { useState } from "react";
import { format, differenceInCalendarDays, startOfMonth, subMonths, endOfMonth, subDays, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, ChevronDown, GitCompareArrows } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const THIS_MONTH_SENTINEL = -1;
export const CUSTOM_SENTINEL = -2;
export const PREV_MONTH_SENTINEL = -3;

/** Helper: format a Date as "YYYY-MM-DD" using LOCAL components (avoids UTC shift). */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function resolveDays(value: number): number {
  if (value === THIS_MONTH_SENTINEL) {
    return Math.max(new Date().getDate() - 1, 1); // days since the 1st of current month
  }
  if (value === PREV_MONTH_SENTINEL) {
    const now = new Date();
    const prevStart = startOfMonth(subMonths(now, 1));
    return differenceInCalendarDays(now, prevStart);
  }
  if (value === CUSTOM_SENTINEL) {
    return 30;
  }
  return value; // 0 is valid → means "today only"
}

/** Returns the actual date range for a given filter value */
export function getDateRange(value: number, customFrom?: Date): { from: Date; to: Date } {
  const now = new Date();

  if (value === CUSTOM_SENTINEL && customFrom) {
    return { from: customFrom, to: now };
  }

  if (value === THIS_MONTH_SENTINEL) {
    // Use startOfMonth to avoid any timezone shifts
    const from = startOfMonth(now);
    return { from, to: now };
  }

  if (value === PREV_MONTH_SENTINEL) {
    const prevStart = startOfMonth(subMonths(now, 1));
    const prevEnd = endOfMonth(subMonths(now, 1));
    return { from: prevStart, to: prevEnd };
  }

  const effectiveDays = value;
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - effectiveDays);
  return { from, to: now };
}

/** Comparison period types */
export type ComparisonPeriod = "previous" | "day" | "week" | "month";

export const COMPARISON_OPTIONS: { value: ComparisonPeriod; label: string }[] = [
  { value: "previous", label: "Periodo Anterior" },
  { value: "day", label: "Día Anterior" },
  { value: "week", label: "Semana Anterior" },
  { value: "month", label: "Mes Anterior" },
];

/** Resolves the comparison date range based on the current selection and comparison period */
export function resolveComparisonRange(
  filterValue: number,
  comparisonPeriod: ComparisonPeriod,
  customFrom?: Date
): { from: Date; to: Date } {
  const { from: currentFrom, to: currentTo } = getDateRange(filterValue, customFrom);
  const rangeDays = differenceInCalendarDays(currentTo, currentFrom);

  if (comparisonPeriod === "previous") {
    // Same length period immediately before
    const compTo = new Date(currentFrom.getFullYear(), currentFrom.getMonth(), currentFrom.getDate() - 1);
    const compFrom = new Date(compTo.getFullYear(), compTo.getMonth(), compTo.getDate() - rangeDays);
    return { from: compFrom, to: compTo };
  }

  if (comparisonPeriod === "day") {
    const compTo = subDays(currentTo, 1);
    const compFrom = subDays(currentFrom, 1);
    return { from: compFrom, to: compTo };
  }

  if (comparisonPeriod === "week") {
    const compTo = subWeeks(currentTo, 1);
    const compFrom = subWeeks(currentFrom, 1);
    return { from: compFrom, to: compTo };
  }

  // month
  const compTo = subMonths(currentTo, 1);
  const compFrom = subMonths(currentFrom, 1);
  return { from: compFrom, to: compTo };
}

/** Resolves comparison days for the backend RPC (dias_atras for comparison period) */
export function resolveComparisonDays(
  filterValue: number,
  comparisonPeriod: ComparisonPeriod,
  customFrom?: Date
): number {
  const { from } = resolveComparisonRange(filterValue, comparisonPeriod, customFrom);
  const now = new Date();
  return Math.max(differenceInCalendarDays(now, from), 1);
}

interface Preset {
  label: string;
  value: number;
}

const presets: Preset[] = [
  { label: "Hoy", value: 0 },
  { label: "Este Mes", value: THIS_MONTH_SENTINEL },
  { label: "Última Semana", value: 7 },
  { label: "15 Días", value: 15 },
  { label: "30 Días", value: 30 },
  { label: "Mes Anterior", value: PREV_MONTH_SENTINEL },
  { label: "90 Días", value: 90 },
  { label: "180 Días", value: 180 },
];

function formatRange(from: Date, to: Date): string {
  const fmt = (d: Date) => format(d, "d MMM", { locale: es });
  return `${fmt(from)} – ${fmt(to)}`;
}

function getPresetLabel(value: number): string | undefined {
  return presets.find((p) => p.value === value)?.label;
}

interface TimeFilterProps {
  value: number;
  onChange: (days: number) => void;
  comparisonPeriod?: ComparisonPeriod;
  onComparisonChange?: (period: ComparisonPeriod) => void;
}

export function TimeFilter({ value, onChange, comparisonPeriod, onComparisonChange }: TimeFilterProps) {
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [compOpen, setCompOpen] = useState(false);

  const isCustom = !!customFrom;
  const presetLabel = !isCustom ? getPresetLabel(value) : undefined;
  const { from, to } = getDateRange(isCustom ? CUSTOM_SENTINEL : value, customFrom);

  const handlePresetClick = (preset: Preset) => {
    setCustomFrom(undefined);
    setShowCalendar(false);
    onChange(preset.value);
    setMenuOpen(false);
  };

  const handleCustomClick = () => {
    setShowCalendar(true);
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setCustomFrom(date);
    const days = differenceInCalendarDays(new Date(), date);
    onChange(Math.max(days, 0));
    setShowCalendar(false);
    setMenuOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    setMenuOpen(open);
    if (!open) setShowCalendar(false);
  };

  const displayLabel = isCustom
    ? format(customFrom!, "d MMM", { locale: es }) + " – Hoy"
    : presetLabel || "Seleccionar";

  const compLabel = comparisonPeriod
    ? COMPARISON_OPTIONS.find(o => o.value === comparisonPeriod)?.label ?? "vs Anterior"
    : "vs Anterior";

  // Comparison range for display
  const compRange = comparisonPeriod
    ? resolveComparisonRange(isCustom ? CUSTOM_SENTINEL : value, comparisonPeriod, customFrom)
    : null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Main date selector */}
      <Popover open={menuOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-sm font-medium text-primary transition-colors"
          >
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{displayLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          {showCalendar ? (
            <div>
              <div className="px-3 pt-3 pb-1">
                <button
                  onClick={() => setShowCalendar(false)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Volver
                </button>
              </div>
              <Calendar
                mode="single"
                selected={customFrom}
                onSelect={handleDateSelect}
                disabled={(date) =>
                  date > new Date() || date < new Date("2024-01-01")
                }
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </div>
          ) : (
            <div className="py-1 min-w-[180px]">
              {presets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handlePresetClick(preset)}
                  className={cn(
                    "w-full text-left px-4 py-2 text-sm transition-colors",
                    value === preset.value && !isCustom
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  {preset.label}
                </button>
              ))}
              <div className="h-px bg-border my-1" />
              <button
                onClick={handleCustomClick}
                className={cn(
                  "w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2",
                  isCustom
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-muted"
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                Periodo Personalizado
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Comparison period selector */}
      {onComparisonChange && (
        <Popover open={compOpen} onOpenChange={setCompOpen}>
          <PopoverTrigger asChild>
            <button
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-muted-foreground/20 bg-muted/30 hover:bg-muted/50 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <GitCompareArrows className="h-3 w-3" />
              <span>{compLabel}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <div className="py-1 min-w-[180px]">
              {COMPARISON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onComparisonChange(opt.value);
                    setCompOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-4 py-2 text-sm transition-colors",
                    comparisonPeriod === opt.value
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Date range display */}
      <div className="flex flex-col">
        <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
          {formatRange(from, to)}
        </span>
        {compRange && (
          <span className="text-[9px] sm:text-[10px] text-muted-foreground/60 whitespace-nowrap">
            vs {formatRange(compRange.from, compRange.to)}
          </span>
        )}
      </div>
    </div>
  );
}
