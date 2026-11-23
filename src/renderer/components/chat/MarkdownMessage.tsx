import { useCallback } from 'react';

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('`')) {
      nodes.push(
        <code className="inline-code" key={`code-${key}`}>
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={`strong-${key}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={`em-${key}`}>{token.slice(1, -1)}</em>);
    } else {
      const link = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (link) {
        nodes.push(
          <a key={`link-${key}`} href={link[2]} target="_blank" rel="noreferrer">
            {link[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    }
    key += 1;
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes.length > 0 ? nodes : [text];
}

export function MarkdownMessage({ content }: { content: string }) {
  const handleCopy = useCallback(async (event: React.MouseEvent<HTMLButtonElement>) => {
    const code = event.currentTarget.parentElement?.querySelector('code')?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard access can be unavailable; the code remains selectable.
    }
  }, []);

  const lines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const trimmed = lines[index].trim();

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <div className="chat-code-wrap" key={`code-wrap-${key}`}>
          <button type="button" className="chat-copy-button" onClick={handleCopy}>
            Copy
          </button>
          <pre className="chat-code-block">
            <code data-language={language || undefined}>{codeLines.join('\n')}</code>
          </pre>
        </div>,
      );
      key += 1;
      continue;
    }

    if (trimmed === '') {
      index += 1;
      continue;
    }

    if (/^#{1,3}\s/.test(trimmed)) {
      const level = trimmed.match(/^#+/)?.[0].length ?? 1;
      const Tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5';
      blocks.push(
        <Tag className="chat-heading" key={`heading-${key}`}>
          {renderInline(trimmed.replace(/^#+\s*/, ''))}
        </Tag>,
      );
      key += 1;
      index += 1;
      continue;
    }

    if (/^[-*]\s/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s/, ''));
        index += 1;
      }
      blocks.push(
        <ul className="chat-list" key={`list-${key}`}>
          {items.map((item, itemIndex) => (
            <li key={`item-${itemIndex}`}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      key += 1;
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !lines[index].trim().startsWith('```') &&
      !/^#{1,3}\s/.test(lines[index].trim()) &&
      !/^[-*]\s/.test(lines[index].trim())
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push(
      <p className="chat-paragraph" key={`paragraph-${key}`}>
        {renderInline(paragraphLines.join(' '))}
      </p>,
    );
    key += 1;
  }

  return <div className="markdown-message">{blocks}</div>;
}
