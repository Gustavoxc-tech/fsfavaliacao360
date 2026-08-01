import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import type { Person } from "@/lib/db-types";

export const Route = createFileRoute("/_app")({
  ssr: false,
  component: AppLayout,
});

function ChangePasswordScreen({ person, onDone }: { person: Person; onDone: () => Promise<void> }) {
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não conferem.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }
    const { error: dbError } = await supabase
      .from("people")
      .update({ must_change_password: false })
      .eq("id", person.id);
    setSubmitting(false);
    if (dbError) {
      toast.error("Senha alterada, mas não foi possível liberar o acesso: " + dbError.message);
      return;
    }
    toast.success("Senha atualizada!");
    await onDone();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Trocar senha</CardTitle>
          <CardDescription>
            Este é o seu primeiro acesso. Defina uma nova senha para continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-pass">Nova senha</Label>
              <Input
                id="new-pass"
                type="password"
                required
                minLength={8}
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pass">Confirmar nova senha</Label>
              <Input
                id="confirm-pass"
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Salvando..." : "Salvar nova senha"}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => signOut()}>
              Sair
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function AppLayout() {
  const { loading, session, person, refresh } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (!person) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <h2 className="text-xl font-semibold">Conta sem vínculo</h2>
          <p className="text-sm text-muted-foreground">
            Seu usuário foi criado, mas ainda não está vinculado a nenhuma pessoa cadastrada. Peça ao
            administrador para cadastrar seu email em <code>people</code>.
          </p>
        </div>
      </div>
    );
  }

  if (person.must_change_password) {
    return (
      <ChangePasswordScreen
        person={person}
        onDone={async () => {
          await refresh();
          navigate({ to: "/" });
        }}
      />
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

