"use client";
import React from "react";
import { CopyButton } from "@/components/molecules/CopyButton";
import { useI18n } from "@/common/i18n/I18nProvider";

// El bloque de codigo es oscuro en los dos temas (una "terminal"), asi que sus
// colores de sintaxis son fijos y estan elegidos para ese fondo.
const TOKEN_CLASS = {
  key: "text-[#8fd0ec]",
  string: "text-[#a6e3b8]",
  number: "text-[#f0c060]",
  literal: "text-[#c9b3ff]",
};

const JSON_TOKEN = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/** Resalta JSON con spans de React: el contenido nunca se inyecta como HTML. */
const highlightJson = (source: string) => {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of source.matchAll(JSON_TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(source.slice(last, index));
    const token = match[0];
    const kind = token.startsWith('"') ? (match[2] ? "key" : "string") : /^(true|false|null)$/.test(token) ? "literal" : "number";
    parts.push(
      <span key={index} className={TOKEN_CLASS[kind]}>
        {token}
      </span>,
    );
    last = index + token.length;
  }
  if (last < source.length) parts.push(source.slice(last));
  return parts;
};

/**
 * Stack trace con jerarquia: la primera linea (el error) destaca y los marcos
 * de dependencias y del runtime se apagan, para que el ojo vaya directo al
 * codigo propio.
 */
const highlightStack = (source: string) =>
  source.split("\n").map((line, index) => {
    const vendor = /node_modules|node:internal|\(internal\/|<anonymous>/.test(line);
    const className = index === 0 ? "font-semibold text-[#ffb4b4]" : vendor ? "opacity-45" : "";
    return (
      <span key={index} className={`block ${className}`}>
        {line || " "}
      </span>
    );
  });

type CodeBlockProps = {
  code: string;
  language?: "json" | "stack" | "text";
  maxHeight?: string;
  copyLabel?: string;
  className?: string;
};

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language = "text", maxHeight = "20rem", copyLabel, className = "" }) => {
  const { t } = useI18n();
  return (
    <div className={`group relative overflow-hidden rounded-xl bg-code ring-1 ring-inset ring-white/5 ${className}`}>
      <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <CopyButton
          text={code}
          label={copyLabel ?? t.common.copy}
          iconOnly
          size="xs"
          variant="ghost"
          className="bg-white/10 text-[#d7e3e8] hover:bg-white/20 hover:text-white"
        />
      </div>
      <pre
        className="overflow-auto p-4 font-mono text-[0.75rem] leading-relaxed text-code-ink"
        style={{ maxHeight }}
        tabIndex={0}
      >
        <code>{language === "json" ? highlightJson(code) : language === "stack" ? highlightStack(code) : code}</code>
      </pre>
    </div>
  );
};
