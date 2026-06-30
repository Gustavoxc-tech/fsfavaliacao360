import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_app/")({
  component: Home,
});

function Home() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: isAdmin ? "/admin" : "/evaluator", replace: true });
  }, [isAdmin, navigate]);
  return null;
}
