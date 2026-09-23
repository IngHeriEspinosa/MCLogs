"use client";
import React from "react";
import Link from "next/link";
import { Alert } from "@/components/atoms/Alert";
import { ButtonLink } from "@/components/atoms/Button";
import { EmptyState } from "@/components/atoms/EmptyState";
import { Skeleton } from "@/components/atoms/Skeleton";
import { Tag } from "@/components/atoms/Tag";
import { Card } from "@/components/molecules/Card";
import { ConfirmButton } from "@/components/molecules/ConfirmButton";
import { CopyButton } from "@/components/molecules/CopyButton";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import { useMe } from "@/hooks/useAuth";
import { snapshotUrl, useDeleteSnapshot, useSnapshots } from "@/hooks/useSnapshots";
import { useWorkspace } from "@/hooks/useWorkspaces";

/**
 * Snapshots del espacio activo. Los ve cualquier miembro; cada uno puede borrar
 * los suyos, y el dueño del espacio, todos.
 */
export default function SnapshotsPage() {
  const { t, fmt } = useI18n();
  const snapshots = useSnapshots();
  const remove = useDeleteSnapshot();
  const me = useMe();
  const { isOwner } = useWorkspace();
  const data = snapshots.data ?? [];

  return (
    <DashboardLayout title={t.snapshots.title} eyebrow={t.snapshots.eyebrow} description={t.snapshots.description}>
      <Card title={`${t.snapshots.list} · ${data.length}`} divider flush>
        {snapshots.isLoading ? (
          <div className="flex flex-col gap-2 p-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : snapshots.isError ? (
          <div className="p-5">
            <Alert variant="error">{errorMessage(snapshots.error, t.snapshots.loadError)}</Alert>
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            icon="camera"
            title={t.snapshots.empty}
            description={t.snapshots.emptyHint}
            action={
              <ButtonLink href="/logs" variant="secondary" icon="logs">
                {t.snapshots.goToLogs}
              </ButtonLink>
            }
          />
        ) : (
          <>
            {remove.isError && (
              <div className="px-5 pt-4">
                <Alert variant="error">{errorMessage(remove.error, t.snapshots.removeError)}</Alert>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-surface-2 text-left">
                    {[
                      t.snapshots.columns.title,
                      t.snapshots.columns.visibility,
                      t.snapshots.columns.author,
                      t.snapshots.columns.created,
                      t.snapshots.columns.expires,
                      t.snapshots.columns.views,
                      "",
                    ].map((label, index) => (
                      <th
                        key={index}
                        scope="col"
                        className="whitespace-nowrap border-b border-line px-4 py-2.5 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-ink-3 first:pl-5"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((snapshot) => {
                    const expired = snapshot.expiresAt !== null && new Date(snapshot.expiresAt) <= new Date();
                    const canDelete = isOwner || snapshot.createdById === me.data?.id;
                    const href = `/s/${encodeURIComponent(snapshot.token)}`;
                    return (
                      <tr key={snapshot.id} className={`transition-colors hover:bg-surface-2 ${expired ? "opacity-60" : ""}`}>
                        <td className="border-b border-line py-3 pl-5 pr-4">
                          <Link href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-ink hover:text-brand">
                            {snapshot.title}
                          </Link>
                          <p className="text-xs text-ink-3">
                            {t.snapshots.rows(fmt.number(snapshot.totalMatched))}
                            {snapshot.redacted && ` · ${t.snapshots.viewer.redacted}`}
                          </p>
                        </td>
                        <td className="border-b border-line px-4 py-3">
                          <Tag
                            tone={snapshot.visibility === "public" ? "info" : "brand"}
                            icon={snapshot.visibility === "public" ? "globe" : "users"}
                          >
                            {snapshot.visibility === "public" ? t.snapshots.visibilityPublic : t.snapshots.visibilityWorkspace}
                          </Tag>
                        </td>
                        <td className="border-b border-line px-4 py-3 text-xs text-ink-2">
                          {snapshot.createdByEmail ?? t.snapshots.unknownAuthor}
                        </td>
                        <td className="whitespace-nowrap border-b border-line px-4 py-3 text-xs text-ink-2" title={fmt.dateTime(snapshot.createdAt)}>
                          {fmt.relative(snapshot.createdAt)}
                        </td>
                        <td className="whitespace-nowrap border-b border-line px-4 py-3 text-xs text-ink-2">
                          {expired ? (
                            <Tag tone="warning">{t.snapshots.expired}</Tag>
                          ) : snapshot.expiresAt ? (
                            <span title={fmt.dateTime(snapshot.expiresAt)}>{fmt.relative(snapshot.expiresAt)}</span>
                          ) : (
                            t.snapshots.never
                          )}
                        </td>
                        <td
                          className="whitespace-nowrap border-b border-line px-4 py-3 text-xs tabular-nums text-ink-2"
                          title={snapshot.lastViewedAt ? fmt.dateTime(snapshot.lastViewedAt) : undefined}
                        >
                          {fmt.number(snapshot.viewCount)}
                        </td>
                        <td className="border-b border-line py-3 pl-4 pr-5">
                          <div className="flex items-center justify-end gap-1.5">
                            {!expired && (
                              <CopyButton text={() => snapshotUrl(snapshot.token)} label={t.snapshots.copyLink} icon="copy" iconOnly size="sm" variant="ghost" />
                            )}
                            {canDelete && (
                              <ConfirmButton
                                onConfirm={() => remove.mutate(snapshot.id)}
                                confirmLabel={t.snapshots.confirmRemove}
                                pending={remove.isPending && remove.variables === snapshot.id}
                                icon="trash"
                              >
                                {t.snapshots.remove}
                              </ConfirmButton>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-xs text-ink-3">{t.snapshots.removeNote}</p>
          </>
        )}
      </Card>
    </DashboardLayout>
  );
}
