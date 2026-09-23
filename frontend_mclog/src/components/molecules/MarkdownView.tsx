import React from "react";
import { safeHref } from "@/common/reports/markdown";

/**
 * Vista previa del Markdown que generan los reportes.
 *
 * Es un parser pequeno para el subconjunto que producen los generadores
 * (titulos, parrafos, citas, listas, tablas, bloques de codigo, front matter)
 * y devuelve elementos de React, no HTML. Importa: los reportes contienen
 * mensajes de log, que son texto de terceros, y aqui nada se inyecta con
 * dangerouslySetInnerHTML, asi que un log con <script> se ve como texto.
 */

type Block =
  | { type: "frontmatter"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "code"; lang: string; text: string }
  | { type: "tag"; text: string }
  | { type: "hr" };

const FENCE = /^(`{3,}|~{3,})\s*([\w-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^\s*([-*]|\d+\.)\s+(.*)$/;
const TABLE_SEPARATOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const TAG_LINE = /^<\/?[a-z_][\w-]*>$/;

/** Separa celdas por "|" sin escapar y deshace el escape "\|" de los generadores. */
const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));

const isBlockStart = (line: string, next?: string) =>
  FENCE.test(line) ||
  HEADING.test(line) ||
  LIST_ITEM.test(line) ||
  line.startsWith(">") ||
  TAG_LINE.test(line.trim()) ||
  /^(-{3,}|\*{3,})$/.test(line.trim()) ||
  (line.trim().startsWith("|") && !!next && TABLE_SEPARATOR.test(next.trim()));

export const parseMarkdown = (source: string): Block[] => {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) {
      blocks.push({ type: "frontmatter", text: lines.slice(1, end).join("\n") });
      index = end + 1;
    }
  }

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const marker = fence[1];
      // Cierra una linea hecha solo del mismo caracter y al menos tan larga.
      const closes = (candidate: string) => {
        const trimmed = candidate.trim();
        return trimmed.length >= marker.length && [...trimmed].every((char) => char === marker[0]);
      };
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !closes(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "code", lang: fence[2], text: body.join("\n") });
      index += 1;
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }

    if (TAG_LINE.test(line.trim())) {
      blocks.push({ type: "tag", text: line.trim() });
      index += 1;
      continue;
    }

    if (line.trim().startsWith("|") && lines[index + 1] && TABLE_SEPARATOR.test(lines[index + 1].trim())) {
      const header = splitRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(splitRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (line.startsWith(">")) {
      const body: string[] = [];
      while (index < lines.length && lines[index].startsWith(">")) {
        body.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", text: body.join("\n") });
      continue;
    }

    const item = line.match(LIST_ITEM);
    if (item) {
      const ordered = /\d/.test(item[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(LIST_ITEM);
        if (match) {
          items.push(match[2]);
        } else if (lines[index].startsWith("  ") && lines[index].trim() && items.length) {
          // Continuacion de la vineta anterior.
          items[items.length - 1] += ` ${lines[index].trim()}`;
        } else {
          break;
        }
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const body: string[] = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index], lines[index + 1])) {
      body.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: body.join(" ") });
  }

  return blocks;
};

const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

/** `codigo`, **negrita** y [enlaces](url): lo unico en linea que usan los generadores. */
const inlineWith = (text: string, linkOrigin?: string): React.ReactNode[] =>
  text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const link = part.match(LINK);
    if (link) {
      const href = safeHref(link[2], linkOrigin);
      return href ? (
        <a key={index} href={href} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>
      ) : (
        part
      );
    }
    return part;
  });

export const MarkdownView: React.FC<{ source: string; className?: string; linkOrigin?: string }> = ({
  source,
  className = "",
  linkOrigin,
}) => {
  const blocks = parseMarkdown(source);
  const inline = (text: string) => inlineWith(text, linkOrigin);
  return (
    <div className={`md-view ${className}`}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "frontmatter":
            return (
              <pre key={index} className="md-frontmatter">
                {block.text}
              </pre>
            );
          case "heading": {
            const Tag = `h${Math.min(block.level, 4)}` as "h1" | "h2" | "h3" | "h4";
            return <Tag key={index}>{inline(block.text)}</Tag>;
          }
          case "paragraph":
            return <p key={index}>{inline(block.text)}</p>;
          case "quote":
            return (
              <blockquote key={index}>
                {block.text.split("\n").map((line, lineIndex) => (
                  <p key={lineIndex}>{inline(line)}</p>
                ))}
              </blockquote>
            );
          case "list": {
            const ListTag = block.ordered ? "ol" : "ul";
            return (
              <ListTag key={index}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{inline(item)}</li>
                ))}
              </ListTag>
            );
          }
          case "table":
            return (
              <div key={index} className="md-table">
                <table>
                  <thead>
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        <th key={cellIndex}>{inline(cell)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{inline(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "code":
            return (
              <pre key={index} data-lang={block.lang || undefined}>
                <code>{block.text}</code>
              </pre>
            );
          case "tag":
            return (
              <p key={index} className="md-tag">
                {block.text}
              </p>
            );
          case "hr":
            return <hr key={index} />;
          default:
            return null;
        }
      })}
    </div>
  );
};
