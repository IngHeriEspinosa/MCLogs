"use client";
import React from "react";
import { Alert } from "@/components/atoms/Alert";
import { CopyButton } from "@/components/molecules/CopyButton";
import { useI18n } from "@/common/i18n/I18nProvider";

/** Enlace de activacion para compartir a mano cuando no hubo correo. */
export const InviteLinkNotice: React.FC<{ message: string; link: string }> = ({ message, link }) => {
  const { t } = useI18n();
  return (
    <Alert variant="warning">
      <p>{message}</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2 py-1 font-mono text-xs text-ink">{link}</code>
        <CopyButton text={link} label={t.workspace.copyLink} size="sm" />
      </div>
    </Alert>
  );
};
