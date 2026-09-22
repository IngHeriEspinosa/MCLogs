"use client";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/atoms/Button";
import { Field } from "@/components/atoms/Field";
import { Input } from "@/components/atoms/Input";
import { IconName } from "@/components/atoms/Icon";
import { useI18n } from "@/common/i18n/I18nProvider";
import { useDebounce } from "@/hooks/useDebounce";
import { ADVANCED_FIELDS, AdvancedField, LogFilters } from "@/hooks/useLogFilters";

type Values = Record<AdvancedField, string>;

const ICONS: Record<AdvancedField, IconName> = {
  message: "search",
  service: "layers",
  host: "server",
  traceId: "route",
  errorName: "errors",
  errorCode: "hash",
};

const pick = (filters: LogFilters): Values =>
  Object.fromEntries(ADVANCED_FIELDS.map((key) => [key, filters[key]])) as Values;

type Props = {
  filters: LogFilters;
  setFilters: (patch: Partial<LogFilters>) => void;
};

/**
 * Busqueda por campo. Se escribe en local y llega a la URL con retardo, igual
 * que la busqueda libre: asi no se lanza una consulta por cada tecla.
 */
export const AdvancedLogSearch: React.FC<Props> = ({ filters, setFilters }) => {
  const { t } = useI18n();
  const fromUrl = pick(filters);
  const urlKey = JSON.stringify(fromUrl);
  const [values, setValues] = useState<Values>(fromUrl);
  const debounced = useDebounce(values);

  // La URL manda: atras/adelante o "limpiar" desde fuera actualizan los campos.
  useEffect(() => setValues(JSON.parse(urlKey) as Values), [urlKey]);

  useEffect(() => {
    const trimmed = Object.fromEntries(ADVANCED_FIELDS.map((key) => [key, debounced[key].trim()])) as Values;
    if (JSON.stringify(trimmed) !== urlKey) setFilters(trimmed);
    // Solo reacciona a lo que escribe el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const active = ADVANCED_FIELDS.some((key) => values[key]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
        {ADVANCED_FIELDS.map((key) => (
          <Field key={key} label={t.records.fields[key]}>
            <Input
              icon={ICONS[key]}
              value={values[key]}
              onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
              placeholder={t.records.placeholders[key]}
              className={key === "traceId" || key === "errorCode" ? "font-mono" : ""}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-3">{t.records.advancedHint}</p>
        {active && (
          <Button
            size="sm"
            variant="ghost"
            icon="x"
            onClick={() => setFilters(Object.fromEntries(ADVANCED_FIELDS.map((key) => [key, ""])) as Values)}
          >
            {t.records.clearAdvanced}
          </Button>
        )}
      </div>
    </div>
  );
};
