"use client";
import React from "react";
import { Button } from "@/components/atoms/Button";
import { EmptyState } from "@/components/atoms/EmptyState";
import { useI18n } from "@/common/i18n/I18nProvider";

/**
 * Lo que enseña la PWA al navegar sin conexion. No hay copia de los datos a
 * proposito (ver sw.ts): un panel de monitoreo con cifras viejas engaña.
 * Serwist recarga la pagina sola al volver la conexion.
 */
export default function OfflinePage() {
  const { t } = useI18n();
  return (
    <main id="content" className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <EmptyState
        icon="radio"
        title={t.offline.title}
        description={t.offline.description}
        action={
          <Button variant="primary" icon="refresh" onClick={() => window.location.reload()}>
            {t.offline.retry}
          </Button>
        }
      />
    </main>
  );
}
