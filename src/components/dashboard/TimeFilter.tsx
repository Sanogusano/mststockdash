// Value -1 is a sentinel for "Este Mes" (dynamic days since 1st of current month)
export const THIS_MONTH_SENTINEL = -1;

/** Resolve the sentinel to the actual number of elapsed days this month */
export function resolveDays(value: number): number {
  if (value === THIS_MONTH_SENTINEL) {
    return Math.max(new Date().getDate(), 1);
  }
  return value;
}

/** Get the date range label for the current filter */
function getDateRangeLabel(value: number): string {
  const now = new Date();
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

const options = [
  { label: "Este Mes", value: THIS_MONTH_SENTINEL },
  { label: "7D", value: 7 },
  { label: "30D", value: 30 },
  { label: "90D", value: 90 },
  { label: "180D", value: 180 },
];

export function TimeFilter({ value, onChange }: TimeFilterProps) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <div className="flex items-center gap-0.5 sm:gap-1 bg-muted/50 rounded-lg p-0.5 sm:p-1 border border-border overflow-x-auto">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-2 sm:px-4 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap ${
              value === opt.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
        {getDateRangeLabel(value)}
      </span>
    </div>
  );
}
