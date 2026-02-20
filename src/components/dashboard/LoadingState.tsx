export function LoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-16 rounded-lg bg-muted/30 animate-pulse"
          style={{ opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-4xl mb-3">📊</p>
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}
