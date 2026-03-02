import { useState } from "react";
import { format, differenceInCalendarDays } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Value -1 is a sentinel for "Este Mes" (dynamic days since 1st of current month)
export const THIS_MONTH_SENTINEL = -1;
// Value -2 is a sentinel for custom date range
export const CUSTOM_SENTINEL = -2;

/** Resolve the sentinel to the actual number of elapsed days this month */
export function resolveDays(value: number): number {
  if (value === THIS_MONTH_SENTINEL) {
    return Math.max(new Date().getDate(), 1);
  }
  if (value === CUSTOM_SENTINEL) {
    // Should not happen — caller must resolve before using
    return 30;
  }
  return value;
}

/** Get the date range label for the current filter */
function getDateRangeLabel(value: number, customFrom?: Date): string {
  const now = new Date();

  if (value === CUSTOM_SENTINEL && customFrom) {
    const fmt = (d: Date) =>
      d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
    return `${fmt(customFrom)} – ${fmt(now)}`;
  }

  const effectiveDays = resolveDays(value);
  const from = new Date(now);
  from.setDate(from.getDate() - effectiveDays);

  const fmt = (d: Date) =>
    d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });

  return `${fmt(from)} – ${fmt(now)}`;
}

interface TimeFilterProps {
  value: number;
  onChange: (days: number) => void;
}

const presets = [
  { label: "Este Mes", value: THIS_MONTH_SENTINEL },
  { label: "7D", value: 7 },
  { label: "30D", value: 30 },
  { label: "90D", value: 90 },
  { label: "180D", value: 180 },
];

export function TimeFilter({ value, onChange }: TimeFilterProps) {
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const isCustom = value === CUSTOM_SENTINEL;

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setCustomFrom(date);
    const days = differenceInCalendarDays(new Date(), date);
    // We store the actual days but signal "custom" mode via the sentinel
    // Actually, we pass the computed days directly so RPCs work
    onChange(Math.max(days, 1));
    // Track that we're in custom mode by storing the date
    setPopoverOpen(false);
  };

  const handlePresetClick = (presetValue: number) => {
    setCustomFrom(undefined);
    onChange(presetValue);
  };

  const isPreset = presets.some((p) => p.value === value);

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <div className="flex items-center gap-0.5 sm:gap-1 bg-muted/50 rounded-lg p-0.5 sm:p-1 border border-border overflow-x-auto">
        {presets.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handlePresetClick(opt.value)}
            className={`px-2 sm:px-4 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap ${
              value === opt.value && !customFrom
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}

        {/* Custom date picker */}
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap flex items-center gap-1 ${
                customFrom
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <CalendarIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">
                {customFrom
                  ? format(customFrom, "d MMM", { locale: es })
                  : "Fecha"}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
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
          </PopoverContent>
        </Popover>
      </div>
      <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
        {getDateRangeLabel(customFrom ? CUSTOM_SENTINEL : value, customFrom)}
      </span>
    </div>
  );
}
