import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect } from "react";
import monasteryLogo from "@/assets/monastery-logo.png";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">("login");
  const navigate = useNavigate();
  const { session } = useAuth();

  useEffect(() => {
    if (session) navigate("/", { replace: true });
  }, [session, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Por favor completa todos los campos.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error) {
      setError("Credenciales inválidas. Intenta de nuevo.");
    }
    setLoading(false);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Ingresa tu email.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError("Error al enviar el correo. Intenta de nuevo.");
    } else {
      setResetSent(true);
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-4">
          <img src={monasteryLogo} alt="Monastery logo" className="h-20 w-20 mx-auto rounded-xl" />
          <h1 className="font-display text-2xl font-bold text-foreground">Monastery</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "login" ? "Ingresa a tu dashboard" : "Recuperar contraseña"}
          </p>
        </div>

        {resetSent ? (
          <div className="glass-card rounded-xl p-6 text-center space-y-3">
            <p className="text-sm text-foreground">📧 Revisa tu correo electrónico para restablecer tu contraseña.</p>
            <Button variant="outline" onClick={() => { setMode("login"); setResetSent(false); }}>
              Volver al login
            </Button>
          </div>
        ) : (
          <form onSubmit={mode === "login" ? handleLogin : handleReset} className="glass-card rounded-xl p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@monastery.co"
                autoComplete="email"
                maxLength={255}
              />
            </div>

            {mode === "login" && (
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  maxLength={128}
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Cargando..." : mode === "login" ? "Iniciar sesión" : "Enviar enlace"}
            </Button>

            <div className="text-center">
              {mode === "login" ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => { setMode("reset"); setError(""); }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              ) : (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => { setMode("login"); setError(""); }}
                >
                  Volver al login
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
