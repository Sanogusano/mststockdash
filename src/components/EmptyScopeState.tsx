import { ShieldAlert, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /** Email opcional al que enviar el "Contactar administrador" */
  adminEmail?: string;
  /** Mensaje custom — sobreescribe el default */
  message?: string;
}

export function EmptyScopeState({
  adminEmail = "andres.restrepo@monastery.com.co",
  message,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="h-14 w-14 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
        <ShieldAlert className="h-7 w-7 text-amber-600" />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">
        No tienes tiendas asignadas
      </h2>
      <p className="text-sm text-muted-foreground max-w-md mb-5">
        {message ??
          "Tu administrador aún no ha configurado qué tiendas puedes ver. Contacta a tu admin para resolverlo."}
      </p>
      <Button asChild variant="outline" size="sm">
        <a href={`mailto:${adminEmail}?subject=Acceso%20sin%20tiendas%20asignadas`}>
          <Mail className="h-4 w-4 mr-2" />
          Contactar administrador
        </a>
      </Button>
    </div>
  );
}
