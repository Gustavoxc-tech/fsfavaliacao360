import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, ClipboardList, ClipboardCheck, BarChart3, Settings, FileText, HelpCircle } from "lucide-react";
import { PersonAvatar } from "@/components/PersonAvatar";
import { useGuidedTour } from "@/components/GuidedTour";
import logoAsset from "@/assets/fsfss-logo.png.asset.json";
import type { ReactNode } from "react";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  adminOnly?: boolean;
  tour: string;
}

const items: NavItem[] = [
  { to: "/evaluator", label: "Avaliações", icon: <ClipboardList className="h-4 w-4" />, tour: "nav-evaluator" },
  { to: "/collaborator", label: "Meus Resultados", icon: <BarChart3 className="h-4 w-4" />, tour: "nav-collaborator" },
  { to: "/admin", label: "Admin", icon: <Settings className="h-4 w-4" />, adminOnly: true, tour: "nav-admin" },
  { to: "/pdi", label: "PDI", icon: <ClipboardCheck className="h-4 w-4" />, tour: "nav-pdi" },
  { to: "/reports", label: "Relatórios", icon: <FileText className="h-4 w-4" />, adminOnly: true, tour: "nav-reports" },
];


export function AppShell({ children }: { children: ReactNode }) {
  const { person, isAdmin, signOut } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const startTour = useGuidedTour(!!isAdmin);


  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col">
        {/* Contêiner de cabeçalho da sidebar com items-start para alinhar todos os filhos à esquerda por padrão */}
        <div className="p-6 border-b border-sidebar-border flex flex-col items-start space-y-4">
          {/* BLOCO DA LOGO E NOME DA EMPRESA (Alinhado à esquerda) */}
          {/* justify-start e text-left garantem que o conteúdo permaneça na borda esquerda */}
          <div className="flex items-center gap-3 w-full justify-start">
            {/* O container da logo mantém a centralização interna para a imagem, mas o container em si é empurrado para a esquerda */}
            <div className="h-25 w-25 shrink-0 rounded-xl bg-transparent grid place-items-center p-1.5">
              <img
                src={logoAsset.url}
                alt="Fundação São Francisco de Seguridade Social"
                className="h-full w-full object-contain"
              />
            </div>
            {/* text-left garante que o nome e subtítulo estejam alinhados à esquerda */}
            <div className="text-left">
              <h1 className="text-base font-bold leading-tight">EVSHIFT</h1>
              <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
                Sua jornada em movimento
              </p>
            </div>
          </div>

          {/* BLOCO DA PESSOA */}
          {person && (
            <div className="flex items-center gap-3 w-full justify-start">
              <PersonAvatar
                name={person.full_name}
                url={(person as any).avatar_url}
                size="md"
                className="h-12 w-12 rounded-full"
              />
              <div className="min-w-0 text-sm text-left">
                <div className="font-medium truncate">{person.full_name}</div>
                <div className="text-xs text-sidebar-foreground/60 truncate">
                  {person.job_title ?? "—"}
                </div>
              </div>
            </div>
          )}
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {items
            .filter((i) => !i.adminOnly || isAdmin)
            .map((i) => {
              const active = path === i.to || path.startsWith(i.to + "/");
              return (
                <Link
                  key={i.to}
                  to={i.to}
                  data-tour={i.tour}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  {i.icon}
                  {i.label}
                </Link>
              );
            })}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-1">
          <Button
            variant="ghost"
            size="sm"
            data-tour="help-button"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => startTour()}
          >
            <HelpCircle className="h-4 w-4 mr-2" /> Ajuda · Tour guiado
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>

      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
