import type React from "react";
import { cn } from "@/lib/utils";
import { formatKpiMoney } from "@/lib/kpi-money";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from "recharts";

export function ComparisonIndicator({ actual, anterior, label, percentage, points, invert }: { actual: number; anterior: number; label?: string; percentage?: number; points?: boolean; invert?: boolean }) {
  const pct = percentage ?? (anterior > 0 ? ((actual - anterior) / anterior) * 100 : 0);
  const isUp = pct >= 0;
  return (
    <div className="flex items-center gap-1 mt-0.5">
      <span className={cn("text-xs font-medium", (invert ? !isUp : isUp) ? "text-emerald-600" : "text-destructive")}>
        {isUp ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}{points ? " pp" : "%"}
      </span>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}

export function KpiCard({ label, value, mobileValue, prefix = "", icon: Icon, className, onClick, actual, anterior, children, ventaM2Status }: {
  label: string; value: string; mobileValue?: string; prefix?: string; icon: React.ElementType; className?: string; onClick?: () => void;
  actual?: number; anterior?: number; children?: React.ReactNode;
  ventaM2Status?: { label: string; icon: React.ElementType; colorClass: string; bgClass: string; borderClass: string };
}) {
  return (
    <div
      className={cn("glass-card min-w-0 p-3 sm:p-5 flex items-start gap-2 sm:gap-4", ventaM2Status && `border ${ventaM2Status.borderClass}`, onClick && "cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all")}
      onClick={onClick}
    >
      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", ventaM2Status ? ventaM2Status.bgClass : "bg-primary/10")}>
        {ventaM2Status ? <ventaM2Status.icon className={cn("h-5 w-5", ventaM2Status.colorClass)} /> : <Icon className={cn("h-5 w-5 text-primary", className)} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
          {ventaM2Status && (
            <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold", ventaM2Status.bgClass, ventaM2Status.colorClass)}>
              {ventaM2Status.label === "Excelente" && "👑"} {ventaM2Status.label}
            </span>
          )}
        </div>
        <p className={cn("text-xl sm:text-2xl font-semibold text-foreground mt-0.5 whitespace-normal break-words tabular-nums", className)}>
          {mobileValue ? (
            <>
              <span className="sm:hidden">{prefix}{mobileValue}</span>
              <span className="hidden sm:inline">{prefix}{mobileValue}</span>
            </>
          ) : (
            <>{prefix}{value}</>
          )}
        </p>
        {actual !== undefined && anterior !== undefined && (
          <ComparisonIndicator actual={actual} anterior={anterior} label="vs ant." />
        )}
        {children}
      </div>
    </div>
  );
}

export function ChannelContributionChart({ channelData, title = "💰 Aporte por Canal", composition = false }: {
  channelData: { name: string; actual: number; anterior?: number; detail?: React.ReactNode }[];
  title?: string; composition?: boolean;
}) {
  if (!channelData.length) return null;

  const fmtMillions = formatKpiMoney;

  return (
    <div className="glass-card p-5 mt-4">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      <div className={cn("flex flex-col gap-6", !composition && "lg:flex-row")}>
        {/* Bar Chart */}
        <div className="flex-1 min-w-0 min-h-[200px]">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={channelData} barGap={4} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `$${(v / 1_000_000).toFixed(0)}M`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={55} />
              <Tooltip
                formatter={(v: number, name: string) => [fmtMillions(v), name === "actual" ? "Período actual" : "Período anterior"]}
                contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="actual" name="actual" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              {!composition && <Bar dataKey="anterior" name="anterior" fill="hsl(var(--muted-foreground) / 0.3)" radius={[4, 4, 0, 0]} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Summary Cards */}
        <div className={cn("flex flex-col gap-3", !composition && "lg:w-[260px]")}>
          {channelData.map((ch) => {
            const diff = (ch.anterior ?? 0) > 0 ? ((ch.actual - (ch.anterior ?? 0)) / (ch.anterior ?? 1)) * 100 : 0;
            const isUp = diff >= 0;
            return (
              <div key={ch.name} className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-xs text-muted-foreground font-medium mb-1">{ch.name}</p>
                <p className="text-base font-semibold text-foreground">{fmtMillions(ch.actual)}</p>
                {composition ? ch.detail : <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn("text-xs font-medium", isUp ? "text-emerald-600" : "text-destructive")}>
                    {isUp ? "▲" : "▼"} {Math.abs(diff).toFixed(1)}%
                  </span>
                  <span className="text-[10px] text-muted-foreground">vs {fmtMillions(ch.anterior ?? 0)}</span>
                </div>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-3 h-3 rounded-sm" style={{ background: "hsl(var(--primary))" }} />
          Período actual
        </div>
        {!composition && <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-3 h-3 rounded-sm" style={{ background: "hsl(var(--muted-foreground) / 0.3)" }} />
          Período anterior
        </div>}
      </div>
    </div>
  );
}

