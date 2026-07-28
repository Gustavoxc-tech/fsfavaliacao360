import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/evaluator")({
  component: EvaluatorLayout,
});

function EvaluatorLayout() {
  return <Outlet />;
}
