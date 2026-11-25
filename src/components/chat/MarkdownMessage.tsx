import { Code2, Wrench } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*[^*\n]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="mono rounded bg-white/[0.06] px-1 py-0.5 text-[0.92em] text-[var(--accent)]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      const url = token.slice(token.indexOf("](") + 2, -1);
      nodes.push(
        <button
          key={key}
          className="text-[var(--accent)] underline decoration-dotted underline-offset-2 hover:brightness-125"
          onClick={() => void api.openExternal(url)}
          title={url}
        >
          {label}
        </button>,
      );
    } else {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MarkdownMessage({ content, muted }: { content: string; muted?: boolean }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      const code = body.join("\n");
      if (lang === "tool" || lang === "jarvis_tool") {
        let parsed: { tool?: string; reason?: string } = {};
        try {
          parsed = JSON.parse(code);
        } catch {
          parsed = {};
        }
        blocks.push(
          <div
            key={key++}
            className="my-2 flex items-start gap-2 rounded-lg border border-amber/25 bg-amber/[0.05] px-3 py-2"
          >
            <Wrench size={13} className="mt-0.5 shrink-0 text-amber" />
            <div className="min-w-0">
              <div className="mono text-[11px] text-amber">tool request · {parsed.tool ?? "unknown"}</div>
              {parsed.reason ? <p className="mt-0.5 text-[11px] text-muted">{parsed.reason}</p> : null}
            </div>
          </div>,
        );
      } else {
        blocks.push(
          <div key={key++} className="my-2 overflow-hidden rounded-lg border border-line bg-black/40">
            <div className="flex items-center gap-1.5 border-b border-line px-2.5 py-1 text-[9px] uppercase tracking-widest text-faint">
              <Code2 size={10} /> {lang || "code"}
            </div>
            <pre className="scroll-thin mono overflow-x-auto px-3 py-2.5 text-[11.5px] leading-relaxed text-ink/90">
              {code}
            </pre>
          </div>,
        );
      }
      continue;
    }

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (/^#{1,4}\s/.test(line)) {
      const level = line.match(/^#+/)?.[0].length ?? 1;
      const text = line.replace(/^#+\s*/, "");
      blocks.push(
        <div
          key={key++}
          className={cn(
            "mb-1 mt-3 font-semibold text-ink first:mt-0",
            level <= 2 ? "text-[14px]" : "text-[13px]",
          )}
        >
          {inline(text, `h${key}`)}
        </div>,
      );
      i += 1;
      continue;
    }

    if (/^\s*([-*])\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && (/^\s*([-*])\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i += 1;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={key++} className={cn("my-1.5 space-y-1 pl-4", ordered ? "list-decimal" : "list-disc")}>
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed marker:text-faint">
              {inline(item, `li${key}-${idx}`)}
            </li>
          ))}
        </Tag>,
      );
      continue;
    }

    if (line.trimStart().startsWith(">")) {
      blocks.push(
        <blockquote key={key++} className="my-2 border-l-2 border-[var(--accent-line)] pl-3 text-[12.5px] text-muted">
          {inline(line.replace(/^\s*>\s?/, ""), `q${key}`)}
        </blockquote>,
      );
      i += 1;
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trimStart().startsWith("```") &&
      !/^#{1,4}\s/.test(lines[i]) &&
      !/^\s*([-*])\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !lines[i].trimStart().startsWith(">")
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={key++} className={cn("my-1.5 leading-relaxed first:mt-0", muted && "text-muted")}>
        {inline(para.join(" "), `p${key}`)}
      </p>,
    );
  }

  return <div className="text-[13px] text-ink/90">{blocks.map((b, idx) => <Fragment key={idx}>{b}</Fragment>)}</div>;
}
