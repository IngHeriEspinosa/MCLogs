"use client";
import React, { forwardRef } from "react";
import { Button } from "@/components/atoms/Button";
import { Kbd } from "@/components/atoms/EmptyState";
import { Input } from "@/components/atoms/Input";
import { DateRangePicker } from "@/components/molecules/DateRangePicker";
import { Select } from "@/components/molecules/Select";
import { useI18n } from "@/common/i18n/I18nProvider";
import { LogFilters } from "@/hooks/useLogFilters";
import { useFilterOptions } from "@/hooks/useOptions";

type LogFilterBarProps = {
  filters: LogFilters;
  setFilters: (patch: Partial<LogFilters>) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onReset: () => void;
  activeCount: number;
};

/**
 * Una sola fila de filtros encima de todo lo que acotan: resumen, graficos y
 * tabla responden al mismo corte, asi que las cifras siempre cuadran. El
 * rango de tiempo va primero porque es el filtro al que todo el mundo va.
 */
export const LogFilterBar = forwardRef<HTMLInputElement, LogFilterBarProps>(function LogFilterBar(
  { filters, setFilters, search, onSearchChange, onReset, activeCount },
  searchRef,
) {
  const { t } = useI18n();
  const options = useFilterOptions();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-full sm:w-auto sm:min-w-[15rem]">
        <DateRangePicker value={filters.range} onChange={(range) => setFilters({ range })} />
      </div>

      <Input
        ref={searchRef}
        type="search"
        icon="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={t.logs.searchPlaceholder}
        aria-label={t.logs.searchPlaceholder}
        wrapperClassName="min-w-[13rem] flex-1 basis-56"
        trailing={search ? undefined : <Kbd className="mr-1 hidden sm:inline-flex">/</Kbd>}
      />

      <div className="w-[calc(50%-0.25rem)] sm:w-44">
        <Select
          label={t.levels.label}
          value={filters.level}
          onChange={(level) => setFilters({ level })}
          options={options.levels}
        />
      </div>
      <div className="w-[calc(50%-0.25rem)] sm:w-52">
        <Select
          label={t.envs.label}
          icon="layers"
          value={filters.environment}
          onChange={(environment) => setFilters({ environment })}
          options={options.environments}
        />
      </div>
      <div className="w-full sm:w-56">
        <Select
          label={t.logs.application}
          icon="box"
          value={filters.application}
          onChange={(application) => setFilters({ application })}
          options={options.apps}
          searchable
          allowCustom
        />
      </div>

      {activeCount > 0 && (
        <Button variant="ghost" icon="x" onClick={onReset}>
          {t.common.clearFilters}
          <span className="rounded-full bg-surface-3 px-1.5 font-mono text-[0.6875rem] text-ink-2">{activeCount}</span>
        </Button>
      )}
    </div>
  );
});
