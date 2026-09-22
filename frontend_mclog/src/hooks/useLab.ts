"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { purgeLab, sendLog, sendPlan } from "@/common/lab/run";
import type { LabEnvironment, LabLink, LabLog, LabScenario, LabScenarioId } from "@/common/lab/scenarios";

export type LabRunStatus = "idle" | "running" | "done" | "stopped" | "error";

export type LabRunState = {
  status: LabRunStatus;
  sent: number;
  total: number;
  error?: unknown;
  /** Enlaces del resultado (la traza lleva el traceId generado en esa ejecucion). */
  links: LabLink[];
};

const IDLE: LabRunState = { status: "idle", sent: 0, total: 0, links: [] };

/** Consultas que cambian cuando llegan logs nuevos. */
const refreshData = (queryClient: ReturnType<typeof useQueryClient>) =>
  ["logs", "error-groups", "applications", "trace"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));

/**
 * Ejecucion de escenarios del Lab. Cada escenario lleva su propio estado y su
 * propio AbortController, asi que se pueden lanzar varios a la vez y detener
 * uno sin tocar los demas. Al salir de la pagina se detiene todo lo que siga
 * enviando: un stream en vivo no debe seguir escribiendo en segundo plano.
 */
export function useLabRunner() {
  const queryClient = useQueryClient();
  const [runs, setRuns] = useState<Partial<Record<LabScenarioId, LabRunState>>>({});
  const controllers = useRef(new Map<LabScenarioId, AbortController>());

  useEffect(() => {
    const active = controllers.current;
    return () => active.forEach((controller) => controller.abort());
  }, []);

  const update = useCallback(
    (id: LabScenarioId, patch: Partial<LabRunState>) =>
      setRuns((current) => ({ ...current, [id]: { ...(current[id] ?? IDLE), ...patch } })),
    [],
  );

  const run = useCallback(
    async (scenario: LabScenario, environment: LabEnvironment) => {
      controllers.current.get(scenario.id)?.abort();
      const controller = new AbortController();
      controllers.current.set(scenario.id, controller);

      const plan = scenario.build({ environment, now: Date.now() });
      update(scenario.id, { status: "running", sent: 0, total: plan.logs.length, error: undefined, links: plan.links });

      try {
        const { sent, stopped } = await sendPlan(plan, (progress) => update(scenario.id, progress), controller.signal);
        update(scenario.id, { status: stopped ? "stopped" : "done", sent });
      } catch (error) {
        update(scenario.id, { status: "error", error });
      } finally {
        if (controllers.current.get(scenario.id) === controller) controllers.current.delete(scenario.id);
        refreshData(queryClient);
      }
    },
    [queryClient, update],
  );

  const stop = useCallback((id: LabScenarioId) => controllers.current.get(id)?.abort(), []);

  return { runs, run, stop, idle: IDLE };
}

/** Borra los logs del lab y refresca lo que se este mostrando. */
export const usePurgeLab = (inventory: string[]) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => purgeLab(inventory),
    onSuccess: () => refreshData(queryClient),
  });
};

/** Envia el log del compositor a medida. */
export const useSendLabLog = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (log: LabLog) => sendLog(log),
    onSuccess: () => refreshData(queryClient),
  });
};
