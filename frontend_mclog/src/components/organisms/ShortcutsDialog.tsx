"use client";
import React from "react";
import { Kbd } from "@/components/atoms/EmptyState";
import { Dialog } from "@/components/molecules/Dialog";
import { useI18n } from "@/common/i18n/I18nProvider";
import { GO_TO, GoToKey } from "@/common/keyboard/shortcuts";

/** Una combinacion: teclas que se pulsan seguidas ("g", "l") o juntas ("Mayús", "←"). */
const Keys: React.FC<{ keys: string[]; joiner?: string }> = ({ keys, joiner = "" }) => (
  <span className="flex shrink-0 items-center gap-1">
    {keys.map((key, index) => (
      <React.Fragment key={`${key}-${index}`}>
        {index > 0 && joiner && <span className="text-xs text-ink-3">{joiner}</span>}
        <Kbd>{key}</Kbd>
      </React.Fragment>
    ))}
  </span>
);

/** Ayuda de atajos de teclado, que se abre con "?" desde cualquier vista. */
export const ShortcutsDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { t } = useI18n();
  const s = t.shortcuts;

  const groups: Array<{ title: string; items: Array<{ keys: string[]; joiner?: string; label: string }> }> = [
    {
      title: s.global,
      items: [
        ...(Object.keys(GO_TO) as GoToKey[]).map((key) => ({ keys: ["g", key], label: s.goTo[key] })),
        { keys: ["?"], label: s.help },
      ],
    },
    {
      title: s.logs,
      items: [
        { keys: ["/"], label: s.search },
        { keys: ["↑", "↓"], label: s.moveRows },
        { keys: ["Enter"], label: s.openRow },
        { keys: ["←", "→"], label: s.prevNext },
        { keys: ["Esc"], label: s.close },
      ],
    },
    {
      title: s.chart,
      items: [
        { keys: ["←", "→"], label: s.chartMove },
        { keys: [s.shift, "←"], joiner: "+", label: s.chartSelect },
        { keys: ["Enter"], label: s.chartApply },
      ],
    },
  ];

  return (
    <Dialog open={open} onClose={onClose} title={s.title} description={s.description} icon="keyboard" size="lg">
      <div className="grid gap-6 sm:grid-cols-2">
        {groups.map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h3 className="eyebrow mb-2">{group.title}</h3>
            <ul className="flex flex-col gap-1.5">
              {group.items.map((item) => (
                <li key={item.label} className="flex items-center justify-between gap-3 text-sm text-ink-2">
                  <span>{item.label}</span>
                  <Keys keys={item.keys} joiner={item.joiner} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
};
