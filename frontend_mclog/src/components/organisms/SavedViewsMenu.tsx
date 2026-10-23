"use client";
// Organism: SavedViewsMenu (vistas guardadas de una pantalla: del espacio y personales)
import React, { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, IconButton } from "@/components/atoms/Button";
import { Checkbox } from "@/components/atoms/Checkbox";
import { Field } from "@/components/atoms/Field";
import { Input } from "@/components/atoms/Input";
import { Dialog } from "@/components/molecules/Dialog";
import { Menu, MenuEntry } from "@/components/molecules/Menu";
import { useToast } from "@/components/molecules/Toast";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import { useCreateView, useDeleteView, useSavedViews } from "@/hooks/useMonitoring";
import { usePreference } from "@/hooks/usePreference";
import { useWorkspace } from "@/hooks/useWorkspaces";

type PersonalView = { id: string; name: string; path: string; query: string };

/** Vistas personales guardadas en el navegador, como lista JSON. Un valor roto se trata como vacio. */
const parsePersonal = (raw: string): PersonalView[] => {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter(
          (item): item is PersonalView =>
            typeof item === "object" && item !== null && typeof item.name === "string" && typeof item.query === "string" && typeof item.path === "string",
        )
      : [];
  } catch {
    return [];
  }
};

/**
 * Vistas guardadas de una pantalla: un clic devuelve sus filtros. Las del
 * espacio las crea el dueno y las ven todos; las personales viven en el
 * navegador de cada cual.
 */
export const SavedViewsMenu: React.FC<{ path: string }> = ({ path }) => {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const notify = useToast();
  const { isOwner } = useWorkspace();
  const shared = useSavedViews();
  const createView = useCreateView();
  const deleteView = useDeleteView();
  const [personalRaw, setPersonalRaw] = usePreference<string>("views", "[]");
  const personal = useMemo(() => parsePersonal(personalRaw).filter((view) => view.path === path), [personalRaw, path]);
  const sharedHere = (shared.data ?? []).filter((view) => view.path === path);

  const [saving, setSaving] = useState(false);
  const [managing, setManaging] = useState(false);
  const [name, setName] = useState("");
  const [toWorkspace, setToWorkspace] = useState(false);

  const open = (query: string) => router.push(query ? `${path}?${query}` : path);
  const currentQuery = pathname === path ? searchParams.toString() : "";

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      if (toWorkspace && isOwner) {
        await createView.mutateAsync({ name: trimmed, path, query: currentQuery });
      } else {
        const all = parsePersonal(personalRaw);
        setPersonalRaw(JSON.stringify([...all, { id: `${Date.now()}`, name: trimmed, path, query: currentQuery }]));
      }
      notify(t.views.saved(trimmed));
      setSaving(false);
      setName("");
    } catch (error) {
      notify(errorMessage(error, t.common.unknownError), "error");
    }
  };

  const removePersonal = (id: string) => setPersonalRaw(JSON.stringify(parsePersonal(personalRaw).filter((view) => view.id !== id)));

  const items: MenuEntry[] = [
    ...(sharedHere.length
      ? [
          { type: "label" as const, key: "shared", label: t.views.workspace },
          ...sharedHere.map((view) => ({ key: `s-${view.id}`, label: view.name, icon: "users" as const, onSelect: () => open(view.query) })),
        ]
      : []),
    ...(personal.length
      ? [
          { type: "label" as const, key: "personal", label: t.views.personal },
          ...personal.map((view) => ({ key: `p-${view.id}`, label: view.name, icon: "user" as const, onSelect: () => open(view.query) })),
        ]
      : []),
    ...(sharedHere.length || personal.length ? [{ type: "separator" as const, key: "sep" }] : []),
    { key: "save", label: t.views.saveCurrent, icon: "plus", onSelect: () => setSaving(true) },
    ...(sharedHere.length || personal.length ? [{ key: "manage", label: t.views.manage, icon: "sliders" as const, onSelect: () => setManaging(true) }] : []),
  ];

  return (
    <>
      <Menu label={t.views.label} icon="filter" variant="secondary" items={items} />
      <Dialog
        open={saving}
        onClose={() => setSaving(false)}
        title={t.views.saveTitle}
        description={t.views.saveHint}
        icon="filter"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaving(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="primary" onClick={() => void save()} loading={createView.isPending} disabled={!name.trim()}>
              {t.views.save}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={t.views.name}>
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus />
          </Field>
          {isOwner && <Checkbox checked={toWorkspace} onChange={setToWorkspace} label={t.views.shareWithWorkspace} description={t.views.shareHint} />}
        </div>
      </Dialog>
      <Dialog open={managing} onClose={() => setManaging(false)} title={t.views.manage} icon="sliders" size="sm">
        <ul className="flex flex-col divide-y divide-line">
          {sharedHere.map((view) => (
            <li key={`s-${view.id}`} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{view.name}</span>
              <span className="text-xs text-ink-3">{t.views.workspace}</span>
              {isOwner && (
                <IconButton icon="trash" label={t.views.remove(view.name)} variant="ghost" size="sm" onClick={() => deleteView.mutate(view.id)} />
              )}
            </li>
          ))}
          {personal.map((view) => (
            <li key={`p-${view.id}`} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{view.name}</span>
              <span className="text-xs text-ink-3">{t.views.personal}</span>
              <IconButton icon="trash" label={t.views.remove(view.name)} variant="ghost" size="sm" onClick={() => removePersonal(view.id)} />
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
};
