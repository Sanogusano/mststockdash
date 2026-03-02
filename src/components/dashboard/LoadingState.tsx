import { cn } from "@/lib/utils";

const LOADING_MESSAGES = [
  "Estamos cargando los datos",
  "Procesando información",
  "Preparando tu dashboard",
];

export function LoadingState({ rows = 5, message }: { rows?: number; message?: string }) {
  const displayMessage = message || LOADING_MESSAGES[0];

  return (
    <div className="flex flex-col items-center justify-center py-10 gap-4">
      {/* Animated spinner */}
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-2 border-muted" />
        <div className="absolute inset-0 rounded-full border-2 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin" />
        <div className="absolute inset-1.5 rounded-full border-2 border-t-transparent border-r-primary/60 border-b-transparent border-l-transparent animate-spin" style={{ animationDirection: "reverse", animationDuration: "0.8s" }} />
      </div>
      {/* Animated message */}
      <div className="flex items-center gap-1">
        <p className="text-sm text-muted-foreground font-medium">{displayMessage}</p>
        <span className="inline-flex">
          <span className="animate-bounce text-muted-foreground" style={{ animationDelay: "0ms" }}>.</span>
          <span className="animate-bounce text-muted-foreground" style={{ animationDelay: "150ms" }}>.</span>
          <span className="animate-bounce text-muted-foreground" style={{ animationDelay: "300ms" }}>.</span>
        </span>
      </div>
      {/* Subtle skeleton rows */}
      <div className="w-full space-y-2 mt-2 max-w-md mx-auto">
        {Array.from({ length: Math.min(rows, 3) }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded-full bg-muted/40 animate-pulse"
            style={{ 
              opacity: 1 - i * 0.3,
              width: `${100 - i * 20}%`,
              animationDelay: `${i * 200}ms`,
            }}
          />
        ))}
      </div>
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
