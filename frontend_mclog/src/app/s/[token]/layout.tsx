import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import React from "react";
import { isLocale, LOCALE_COOKIE, localeFromAcceptLanguage, type Locale } from "@/common/i18n/config";
import { dictionaries } from "@/common/i18n/dictionaries";
import { createFormatter } from "@/common/i18n/format";
import { requestOrigin } from "@/common/requestOrigin";
import { describePreview, fetchSnapshotPreview } from "@/common/snapshots/preview";

/** El idioma de quien pide la pagina: su cookie o, un robot de vista previa, su Accept-Language. */
const requestLocale = (): Locale => {
  const stored = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(stored) ? stored : localeFromAcceptLanguage(headers().get("accept-language"));
};

/**
 * Etiquetas de la vista previa del enlace (Slack, WhatsApp, Teams…). El robot
 * no ejecuta JavaScript, asi que salen de aqui, en el servidor. Un snapshot de
 * equipo o desconocido da una tarjeta generica: ni su titulo debe salir.
 *
 * El token viaja en la URL: `no-referrer` para que ninguna peticion saliente lo
 * lleve, y `noindex` para que ningun buscador lo guarde.
 */
export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const locale = requestLocale();
  const t = dictionaries[locale];
  const preview = await fetchSnapshotPreview(params.token);
  const title = preview?.title ?? t.sharePreview.genericTitle;
  const description = preview ? describePreview(preview, t, createFormatter(locale)) : t.sharePreview.genericDescription;

  return {
    metadataBase: requestOrigin(),
    title,
    description,
    referrer: "no-referrer",
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: t.sharePreview.siteName,
      title,
      description,
      locale: locale === "es" ? "es_ES" : "en_US",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function SnapshotLayout({ children }: { children: React.ReactNode }) {
  return children;
}
