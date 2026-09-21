"use client";
import { useMemo } from "react";
import { LEVEL_FILL, LEVELS } from "@/components/atoms/LevelBadge";
import type { SelectOption } from "@/components/molecules/Select";
import { useI18n } from "@/common/i18n/I18nProvider";
import { useApplications } from "@/hooks/useErrors";

export const ENVIRONMENTS = ["production", "staging", "development"] as const;

/** Opciones de los selects de filtro, traducidas y con el punto de color de cada nivel. */
export function useFilterOptions() {
  const { t } = useI18n();
  const applications = useApplications();
  const inventory = applications.data;

  const options = useMemo(() => {
    const levels: SelectOption<string>[] = [
      { value: "", label: t.levels.all },
      ...LEVELS.map((level) => ({ value: level, label: t.levels.names[level], dotClass: LEVEL_FILL[level] })),
    ];
    const environments: SelectOption<string>[] = [
      { value: "", label: t.envs.all },
      ...ENVIRONMENTS.map((env) => ({ value: env, label: t.envs.names[env], hint: env })),
    ];
    const apps: SelectOption<string>[] = [
      { value: "", label: t.logs.allApps },
      ...(inventory ?? []).map((app) => ({
        value: app.application,
        label: app.application,
        hint: app.services.filter((service) => service !== app.application).join(", ") || undefined,
      })),
    ];
    return { levels, environments, apps };
  }, [t, inventory]);

  return { ...options, applications };
}
