import { useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

/**
 * Tour guiado (onboarding) — camada puramente visual.
 * Não altera dados, queries, rotas nem regras de negócio: apenas destaca
 * elementos já existentes na tela (identificados por data-tour="...").
 */

type Stage = {
  /** rota para onde navegar antes de rodar os passos (null = fica onde está) */
  route?: string | (() => string | null);
  steps: DriveStep[];
};

const step = (selector: string, title: string, description: string): DriveStep => ({
  element: selector,
  popover: { title, description },
});

function firstAssignmentRoute(): string | null {
  const el = document.querySelector<HTMLElement>("[data-tour='eval-card']");
  const id = el?.dataset.assignmentId;
  return id ? `/evaluator/${id}` : null;
}

function buildStages(isAdmin: boolean): Stage[] {
  const stages: Stage[] = [
    {
      route: "/evaluator",
      steps: [
        step(
          "[data-tour='nav-evaluator']",
          "Avaliações",
          "Aqui ficam todas as avaliações que foram atribuídas a você em cada ciclo.",
        ),
        step(
          "[data-tour='nav-collaborator']",
          "Meus Resultados",
          "Nesta área você acompanha os seus próprios resultados: competências, metas e nota final.",
        ),
        step(
          "[data-tour='eval-list']",
          "Minhas Avaliações",
          "Cada card representa uma pessoa que você precisa avaliar, com o papel que você exerce (gestor, par, subordinado ou autoavaliação) e o prazo do ciclo.",
        ),
        step(
          "[data-tour='eval-status']",
          "Status da avaliação",
          "Pendente: ainda não iniciada. Em andamento: já tem notas salvas. Concluída: finalizada e enviada.",
        ),
        step(
          "[data-tour='eval-action']",
          "Avaliar / Revisar",
          "Use este botão para abrir a avaliação. Se ela já estiver concluída, o botão muda para 'Revisar'.",
        ),
      ],
    },
    {
      route: firstAssignmentRoute,
      steps: [
        step(
          "[data-tour='assignment-tabs']",
          "As 4 etapas da avaliação",
          "A avaliação é feita em sequência: Avaliação 360°, Metas, Qualificações e Certificações. Qualificações e Certificações são apenas para consulta.",
        ),
        step(
          "[data-tour='assignment-tabs']",
          "Salvamento automático",
          "As notas são salvas automaticamente conforme você preenche — você pode sair e voltar depois sem perder nada.",
        ),
      ],
    },
    {
      route: "/collaborator",
      steps: [
        step(
          "[data-tour='results-tabs']",
          "Meus Resultados",
          "Dashboard: visão geral com nota final e gráficos. Avaliação 360°: notas por competência e por tipo de avaliador. Metas: seu desempenho em cada meta do ciclo.",
        ),
      ],
    },
  ];

  if (!isAdmin) return stages;

  stages.push(
    {
      route: "/admin/people",
      steps: [
        step("[data-tour='nav-admin']", "Admin", "Área de administração: cadastros e configuração de todo o processo."),
        step("[data-tour='nav-reports']", "Relatórios", "Visão consolidada dos resultados de todos os colaboradores."),
        step("[data-tour='admin-tab-/admin/people']", "Pessoas", "Cadastro dos colaboradores, agrupados por Diretoria e Gerência, com foto e dados básicos."),
        step("[data-tour='admin-tab-/admin/cycles']", "Ciclos", "Períodos de avaliação (datas de início e fim) e o status de cada ciclo."),
        step("[data-tour='admin-tab-/admin/assignments']", "Atribuições", "Matriz de quem avalia quem em cada ciclo e com qual papel."),
        step("[data-tour='admin-tab-/admin/pending']", "Avaliações pendentes", "Acompanhe, em cards, todas as avaliações ainda não concluídas e o progresso de cada uma."),
        step("[data-tour='admin-tab-/admin/competencies']", "Competências", "Catálogo de competências (atitudes e habilidades) e quais se aplicam a cada avaliado."),
        step("[data-tour='admin-tab-/admin/goals']", "Metas", "Categorias, modelos de metas e as metas atribuídas a cada colaborador no ciclo."),
        step("[data-tour='admin-tab-/admin/academic']", "Qualificação", "Níveis de formação acadêmica e a qualificação registrada para cada pessoa."),
        step("[data-tour='admin-tab-/admin/certifications']", "Certificações", "Catálogo de certificações profissionais e sua atribuição aos colaboradores."),
      ],
    },
    {
      route: "/reports",
      steps: [
        step(
          "[data-tour='reports-table']",
          "Relatórios",
          "Resultado consolidado por colaborador: 360°, metas, qualificação, certificação e nota final geral.",
        ),
        step(
          "[data-tour='report-export']",
          "Exportar",
          "Exporte o resultado individual em Excel (planilha detalhada) ou PDF (relatório pronto para impressão).",
        ),
      ],
    },
  );

  return stages;
}

async function waitForElement(selector: string, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (document.querySelector(selector)) return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

function runStage(steps: DriveStep[], isLastStage: boolean): Promise<"next" | "abort"> {
  return new Promise((resolve) => {
    let completed = false;
    const d = driver({
      steps,
      animate: true,
      overlayColor: "rgba(0, 26, 51, 0.65)",
      showProgress: true,
      progressText: "{{current}} de {{total}}",
      allowClose: true,
      nextBtnText: "Próximo",
      prevBtnText: "Voltar",
      doneBtnText: isLastStage ? "Concluir" : "Próximo",
      showButtons: ["next", "previous", "close"],
      onNextClick: () => {
        if (d.isLastStep()) {
          completed = true;
          d.destroy();
        } else {
          d.moveNext();
        }
      },
      onPrevClick: () => d.movePrevious(),
      onDestroyed: () => resolve(completed ? "next" : "abort"),
    });
    d.drive();
  });
}

export function useGuidedTour(isAdmin: boolean) {
  const navigate = useNavigate();
  const running = useRef(false);

  return useCallback(async () => {
    if (running.current) return;
    running.current = true;
    const origin = window.location.pathname;

    try {
      for (const [index, stage] of buildStages(isAdmin).entries()) {
        const route = typeof stage.route === "function" ? stage.route() : stage.route;
        if (typeof stage.route === "function" && !route) continue; // nada para mostrar
        if (route && window.location.pathname !== route) {
          await navigate({ to: route });
        }
        const selector = String(stage.steps[0].element);
        const ok = await waitForElement(selector);
        if (!ok) continue;
        const stages = buildStages(isAdmin);
        const result = await runStage(stage.steps, index === stages.length - 1);
        if (result === "abort") break;
      }
    } finally {
      running.current = false;
      if (window.location.pathname !== origin) navigate({ to: origin });
    }
  }, [isAdmin, navigate]);
}
