"use client";
import React, { useState } from "react";
import { Alert } from "@/components/atoms/Alert";
import { Field } from "@/components/atoms/Field";
import { Icon } from "@/components/atoms/Icon";
import { ConfirmButton } from "@/components/molecules/ConfirmButton";
import { Select } from "@/components/molecules/Select";
import { LabComposer } from "@/components/organisms/LabComposer";
import { LabScenarioCard } from "@/components/organisms/LabScenarioCard";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import { LAB_PREFIX, LAB_SCENARIOS, LabEnvironment } from "@/common/lab/scenarios";
import { useWorkspace } from "@/hooks/useWorkspaces";
import { usePublicSettings } from "@/hooks/useSettings";
import { useApplications } from "@/hooks/useErrors";
import { usePurgeLab, useLabRunner } from "@/hooks/useLab";
import { ENVIRONMENTS } from "@/hooks/useOptions";

/**
 * Lab: escenarios de prueba que envian logs reales para ver cada pantalla con
 * datos, un compositor de log a medida y la limpieza de todo lo generado.
 *
 * Solo para administradores: escribe datos en el servicio, y la limpieza usa
 * la purga, que el backend reserva al rol admin.
 */
export default function LabPage() {
  const { t, fmt } = useI18n();
  const workspace = useWorkspace();
  const { labEnabled } = usePublicSettings();
  const applications = useApplications();
  const [environment, setEnvironment] = useState<LabEnvironment>("development");
  const { runs, run, stop, idle } = useLabRunner();
  const purge = usePurgeLab((applications.data ?? []).map((app) => app.application));

  if ((workspace.ready && workspace.current && !workspace.isOwner) || !labEnabled) {
    return (
      <DashboardLayout title={t.lab.title} eyebrow={t.lab.eyebrow} width="narrow">
        <Alert variant="error">{labEnabled ? t.common.ownerOnly : t.lab.disabled}</Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={t.lab.title} eyebrow={t.lab.eyebrow} description={t.lab.description}>
      <div className="flex flex-col gap-4 3xl:gap-5">
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end">
            <div className="w-full sm:w-60">
              <Field label={t.lab.environment} hint={t.lab.environmentHint} info={t.fieldInfo.lab.environment}>
                <Select
                  icon="layers"
                  value={environment}
                  onChange={(value) => setEnvironment(value as LabEnvironment)}
                  options={ENVIRONMENTS.map((value) => ({ value, label: t.envs.names[value], hint: value }))}
                />
              </Field>
            </div>
            <p className="flex max-w-xl items-start gap-2 pb-0.5 text-[0.8125rem] leading-relaxed text-ink-2 sm:pb-6">
              <Icon name="flask" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              {t.lab.notice(LAB_PREFIX)}
            </p>
          </div>

          <div className="flex flex-col items-start gap-1.5 lg:items-end">
            <p className="text-xs text-ink-3">{t.lab.cleanup.description}</p>
            <ConfirmButton onConfirm={() => purge.mutate()} confirmLabel={t.lab.cleanup.confirm} pending={purge.isPending}>
              {t.lab.cleanup.action}
            </ConfirmButton>
          </div>
        </section>

        {environment === "production" && <Alert variant="warning">{t.lab.productionWarning}</Alert>}
        {purge.isError && <Alert variant="error">{errorMessage(purge.error, t.common.unknownError)}</Alert>}
        {purge.isSuccess && (
          <Alert variant="success">
            {purge.data > 0 ? t.lab.cleanup.done(fmt.number(purge.data)) : t.lab.cleanup.none}
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3 4xl:grid-cols-4 3xl:gap-5">
          {LAB_SCENARIOS.map((scenario) => (
            <LabScenarioCard
              key={scenario.id}
              scenario={scenario}
              state={runs[scenario.id] ?? idle}
              onRun={() => void run(scenario, environment)}
              onStop={() => stop(scenario.id)}
            />
          ))}
        </div>

        <LabComposer environment={environment} />
      </div>
    </DashboardLayout>
  );
}
