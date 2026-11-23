import { describe, expect, it } from 'vitest';
import {
  createAiError,
  httpStatusError,
  toAiError,
} from '../../src/main/services/ai/ai-errors';

describe('AI error normalization', () => {
  it('redacts credentials from error messages', () => {
    const error = createAiError(
      'http_error',
      'Provider rejected sk-abcdefghijklmnop and Bearer token123456789',
      false,
    );

    expect(error.message).not.toContain('sk-abcdefghijklmnop');
    expect(error.message).not.toContain('token123456789');
    expect(error.message).toContain('[redacted-key]');
  });

  it('maps HTTP statuses to stable retry decisions', () => {
    expect(httpStatusError(401).code).toBe('http_error');
    expect(httpStatusError(401).retryable).toBe(false);
    expect(httpStatusError(404).retryable).toBe(false);
    expect(httpStatusError(408).code).toBe('timeout');
    expect(httpStatusError(429)).toMatchObject({ code: 'rate_limited', retryable: true });
    expect(httpStatusError(503).retryable).toBe(true);
    expect(httpStatusError(400).retryable).toBe(false);
  });

  it('normalizes abort and timeout errors', () => {
    expect(toAiError({ name: 'AbortError' }).code).toBe('aborted');
    expect(toAiError({ name: 'TimeoutError' }).retryable).toBe(true);
    expect(toAiError(new Error('plain')).code).toBe('unknown');
  });
});
