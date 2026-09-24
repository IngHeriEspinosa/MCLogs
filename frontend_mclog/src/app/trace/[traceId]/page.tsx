"use client";
import React, { useState } from "react";
import { useParams } from "next/navigation";
import { Alert } from "@/components/atoms/Alert";
import { Button, ButtonLink } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icon";
import { Skeleton } from "@/components/atoms/Skeleton";
import { CopyButton } from "@/components/molecules/CopyButton";
import { useToast } from "@/components/molecules/Toast";
import { ShareSnapshotDialog } from "@/components/organisms/ShareSnapshotDialog";
import { TraceKpis, TraceTimeline, traceStatsOf } from "@/components/organisms/TraceTimeline";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { saveFile } from "@/common/api/download";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import { buildTraceBrief, buildTraceMarkdown } from "@/common/reports/build";
import { useTrace } from "@/hooks/useErrors";

export default function TracePage() {
  const { t, locale } = useI18n();
  const notify = useToast();
  const params = useParams<{ traceId: string }>();
  const traceId = decodeURIComponent(params.traceId ?? "");
  const trace = useTrace(traceId);

  const logs = trace.data?.data ?? [];
  const [sharing, setSharing] = useState(false);

  const download = () => {
    const name = `mclog-trace-${traceId.slice(0, 24).replace(/[^\w-]/g, "_")}.md`;
    saveFile(buildTraceMarkdown(traceId, logs, locale), name, "text/markdown");
    notify(t.toast.downloaded(name));
  };

  return (
    <DashboardLayout
      title={t.trace.title}
      eyebrow={t.trace.eyebrow}
      description={t.trace.description}
      actions={
        <>
          <ButtonLink href="/logs" icon="arrowLeft" variant="ghost">
            {t.trace.back}
          </ButtonLink>
          {logs.length > 0 && (
            <>
              <Button icon="share" title={t.snapshots.shareHint} onClick={() => setSharing(true)}>
                {t.snapshots.share}
              </Button>
              <Button icon="download" onClick={download}>
                {t.trace.downloadMd}
              </Button>
              <CopyButton
                size="md"
                variant="primary"
                icon="sparkles"
                label={t.trace.copyAi}
                toast={t.toast.aiCopied}
                text={() => buildTraceBrief(traceId, logs, locale)}
              />
            </>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4 3xl:gap-5">
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 shadow-card">
          <Icon name="route" className="h-4 w-4 text-brand" />
          <code className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{traceId}</code>
          <CopyButton text={traceId} label={t.trace.copyId} iconOnly size="sm" variant="ghost" />
        </div>

        {trace.isError && (
          <Alert variant="error" title={t.trace.notFound}>
            {errorMessage(trace.error, t.common.unknownError)}
          </Alert>
        )}

        {!trace.isError && <TraceKpis stats={traceStatsOf(logs)} loading={trace.isLoading} />}

        {trace.isLoading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        )}

        {logs.length > 0 && <TraceTimeline logs={logs} />}
      </div>
      <ShareSnapshotDialog
        open={sharing}
        onClose={() => setSharing(false)}
        source={{ kind: "trace", traceId }}
        total={trace.data ? logs.length : null}
      />
    </DashboardLayout>
  );
}
