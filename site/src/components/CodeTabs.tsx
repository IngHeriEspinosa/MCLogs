"use client";

import { useState } from "react";

export interface CodeSample {
  id: string;
  label: string;
  /** HTML ya coloreado en el build por `highlightCode`. */
  html: string;
  note?: string;
}

export function CodeTabs({ samples }: { samples: CodeSample[] }) {
  const [active, setActive] = useState(samples[0]?.id);
  const current = samples.find((s) => s.id === active) ?? samples[0];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
      <div role="tablist" aria-label="Ejemplos por entorno" className="flex gap-1 overflow-x-auto border-b border-slate-700 bg-slate-800/60 px-2 py-2">
        {samples.map((sample) => {
          const selected = sample.id === current?.id;
          return (
            <button
              key={sample.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(sample.id)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? "bg-primary-600 text-white"
                  : "text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              {sample.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        <pre className="overflow-x-auto p-5 text-sm leading-relaxed">
          {/* El HTML lo genera highlight.js en el build a partir de codigo
              escrito aqui mismo, nunca de una entrada de usuario. */}
          <code className="hljs font-mono" dangerouslySetInnerHTML={{ __html: current?.html ?? "" }} />
        </pre>
        {current?.note && (
          <p className="border-t border-slate-800 px-5 py-3 text-sm text-slate-400">{current.note}</p>
        )}
      </div>
    </div>
  );
}
