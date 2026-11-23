import type { AiError, AiErrorCode } from '../../../shared/ai';
import { redactSensitiveText } from '../../utils/redact';

export class AiProviderError extends Error {
  readonly aiError: AiError;

  constructor(error: AiError) {
    super(error.message);
    this.name = 'AiProviderError';
    this.aiError = error;
  }
}

export function createAiError(
  code: AiErrorCode,
  message: string,
  retryable: boolean,
  status?: number,
): AiError {
  return {
    code,
    message: redactSensitiveText(message, 300) || 'The AI request failed.',
    retryable,
    ...(status === undefined ? {} : { status }),
  };
}

export function isAiProviderError(error: unknown): error is AiProviderError {
  return error instanceof AiProviderError;
}

export function toAiError(error: unknown, fallbackMessage = 'The AI request failed.'): AiError {
  if (isAiProviderError(error)) {
    return error.aiError;
  }

  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : null;
  if (name === 'AbortError') {
    return createAiError('aborted', 'The request was cancelled.', false);
  }
  if (name === 'TimeoutError') {
    return createAiError('timeout', 'The provider did not respond in time.', true);
  }

  return createAiError('unknown', fallbackMessage, false);
}

export function httpStatusError(status: number): AiError {
  if (status === 401 || status === 403) {
    return createAiError(
      'http_error',
      `The provider rejected the request (${status}). Check the provider configuration or API key.`,
      false,
      status,
    );
  }
  if (status === 404) {
    return createAiError(
      'http_error',
      'The provider endpoint was not found (404). Check the base URL and model.',
      false,
      status,
    );
  }
  if (status === 408) {
    return createAiError('timeout', 'The provider timed out the request (408).', true, status);
  }
  if (status === 429) {
    return createAiError(
      'rate_limited',
      'The provider is rate limiting requests (429).',
      true,
      status,
    );
  }
  if (status >= 500) {
    return createAiError(
      'http_error',
      `The provider is unavailable (${status}).`,
      true,
      status,
    );
  }
  if (status >= 400) {
    return createAiError(
      'http_error',
      `The provider rejected the request (${status}). Check the model and request settings.`,
      false,
      status,
    );
  }
  return createAiError(
    'invalid_response',
    `The provider returned an unexpected status (${status}).`,
    false,
    status,
  );
}
