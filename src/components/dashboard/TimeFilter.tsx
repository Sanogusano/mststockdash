import { useState } from "react";
import { format, differenceInCalendarDays, startOfMonth, subMonths, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const THIS_MONTH_SENTINEL = -1;
export const CUSTOM_SENTINEL = -2;
const PREV_MONTH_SENTINEL = -3;

export function resolveDays(value: number): number {
  if (value === THIS_MONTH_SENTINEL) {
    return Math.max(new Date().getDate(), 1);
  }
  if (value === PREV_MONTH_SENTINEL) {
    const now = new Date();
    const prevStart = startOfMonth(subMonths(now, 1));
    const prevEnd = endOfMonth(subMonths(now, 1));
    return differenceInCalendarDays(now, prevStart);
  }
  if (value === CUSTOM_SENTINEL) {
    return 30;
  }
  return value;
}

interface Preset {
  label: string;
  value: number;
}

const presets: Preset[] = [
  { label: "Este Mes", value: THIS_MONTH_SENTINEL },
  { label: "Última Semana", value: 7 },
  { label: "15 Días", value: 15 },
  { label: "30 Días", value: 30 },
  { label: "Mes Anterior", value: PREV_MONTH_SENTINEL },
  { label: "90 Días", value: 90 },
  { label: "180 Días", value: 180 },
];

function getDateRange(value: number, customFrom?: Date): { from: Date; to: Date } {
  const now = new Date();

  if (value === CUSTOM_SENTINEL && customFrom) {
    return { from: customFrom, to: now };
  }

  if (value === PREV_MONTH_SENTINEL) {
    const prevStart = startOfMonth(subMonths(now, 1));
    const prevEnd = endOfMonth(subMonths(now, 1));
    return { from: prevStart, to: prevEnd };
  }

  const effectiveDays = resolveDays(value);
  const from = new Date(now);
  from.setDate(from.getDate() - effectiveDays);
  return { from, to: now };
}

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
}

export function TimeFilter({ value, onChange }: TimeFilterProps) {
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

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
    onChange(Math.max(days, 1));
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

  return (
    <div className="flex items-center gap-2">
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
      <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
        {formatRange(from, to)}
      </span>
    </div>
  );
}
