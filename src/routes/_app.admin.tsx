import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_app/admin")({
  component: AdminLayout,
});

const tabs = [
  { to: "/admin/cycles", label: "Ciclos" },
  { to: "/admin/people", label: "Pessoas" },
  { to: "/admin/assignments", label: "Atribuições" },
  { to: "/admin/competencies", label: "Competências" },
  { to: "/admin/goals", label: "Metas" },
  { to: "/admin/academic", label: "Qualificação" },
  { to: "/admin/certifications", label: "Certificações" },
];

function AdminLayout() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/" });
    if (path === "/admin") navigate({ to: "/admin/cycles", replace: true });
  }, [loading, isAdmin, navigate, path]);

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Administração</h1>
        <p className="text-sm text-muted-foreground">Gestão de ciclos, competências, pessoas e atribuições.</p>
      </div>
      <div className="flex gap-1 border-b">
        {tabs.map((t) => {
          const active = path.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
