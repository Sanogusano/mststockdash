interface StatusBadgeProps {
  label: string;
}

export function StatusBadge({ label }: StatusBadgeProps) {
  const getVariant = (text: string) => {
    const t = text.toUpperCase();
    if (t.includes("ÓPTIMO") || t.includes("OPTIMO") || t.includes("SUFICIENTE") || t.includes("TOP PERFORMER")) {
      return "status-optimal";
    }
    if (t.includes("RIESGO") || t.includes("PLANEAR") || t.includes("ALZA") || t.includes("ESTABLE")) {
      return "status-warning";
    }
    if (t.includes("SOBRESTOCK") || t.includes("URGENTE") || t.includes("EXPLOSIVO") || t.includes("CRÍTICO")) {
      return "status-danger";
    }
    return "status-warning";
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getVariant(label)}`}
    >
      {label}
    </span>
  );
}
