const DEFAULT_MAX_LENGTH = 500;

const REDACTIONS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bsk-[A-Za-z0-9_-]{6,}\b/g, replacement: '[redacted-key]' },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, replacement: 'Bearer [redacted]' },
  {
    pattern: /\b(api[_-]?key|access[_-]?token|secret|password)\b\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi,
    replacement: '$1=[redacted]',
  },
];

/**
 * Defense in depth: callers must never pass credentials to the activity log,
 * but redaction keeps a mistake from persisting a recognizable key.
 */
export function redactSensitiveText(input: string, maxLength = DEFAULT_MAX_LENGTH): string {
  let result = input.replace(/[\u0000-\u001f\u007f]/g, ' ');

  for (const { pattern, replacement } of REDACTIONS) {
    result = result.replace(pattern, replacement);
  }

  result = result.replace(/\s+/g, ' ').trim();

  if (result.length > maxLength) {
    result = `${result.slice(0, Math.max(0, maxLength - 1))}\u2026`;
  }

  return result;
}
