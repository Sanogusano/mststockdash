import { FinanzasLayout } from "./FinanzasLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Banknote, CreditCard, Construction } from "lucide-react";
import { Link } from "react-router-dom";

export default function FinanzasDashboardPage() {
  return (
    <FinanzasLayout title="Dashboard Financiero">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Construction className="h-4 w-4 text-amber-600" />
            Dashboard general — En construcción
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          KPIs consolidados y participación por pasarela próximamente. Por ahora, accede a las conciliaciones individuales.
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { to: "/finanzas/addi", label: "Addi", color: "text-emerald-600" },
          { to: "/finanzas/wompi", label: "Wompi", color: "text-sky-600" },
          { to: "/finanzas/mercadopago", label: "Mercado Pago", color: "text-amber-600" },
          { to: "/finanzas/sistecredito", label: "Sistecredito", color: "text-purple-600" },
        ].map((p) => (
          <Link key={p.to} to={p.to}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-5 flex items-center gap-3">
                <CreditCard className={`h-6 w-6 ${p.color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">Conciliación</p>
                  <p className="text-base font-semibold">{p.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </FinanzasLayout>
  );
}
