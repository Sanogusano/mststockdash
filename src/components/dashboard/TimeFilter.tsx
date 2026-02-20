interface TimeFilterProps {
  value: number;
  onChange: (days: number) => void;
}

const options = [
  { label: "7D", value: 7 },
  { label: "30D", value: 30 },
  { label: "90D", value: 90 },
  { label: "180D", value: 180 },
];

export function TimeFilter({ value, onChange }: TimeFilterProps) {
  return (
    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 border border-border">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
            value === opt.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
