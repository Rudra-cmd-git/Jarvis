import type { AiError } from '../../../shared/ai';

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 2_000,
};

export function shouldRetry(
  error: AiError,
  attempt: number,
  emittedContent: boolean,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): boolean {
  return !emittedContent && error.retryable && attempt < policy.maxAttempts;
}

export function retryDelayMs(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): number {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** exponent);
}

export async function sleepWithSignal(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, Math.max(0, ms));

    function onAbort(): void {
      clearTimeout(timer);
      resolve(false);
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export interface TimeoutSignal {
  signal: AbortSignal;
  timedOut: () => boolean;
  cleanup: () => void;
}

/**
 * Combines a user cancellation signal with a per-attempt timeout. The returned
 * `timedOut` flag distinguishes a slow provider from a user cancellation.
 */
export function createTimeoutSignal(parent: AbortSignal, timeoutMs: number): TimeoutSignal {
  const controller = new AbortController();
  let timedOut = false;

  const onAbort = (): void => controller.abort(parent.reason);
  if (parent.aborted) {
    controller.abort(parent.reason);
  } else {
    parent.addEventListener('abort', onAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('AI request timed out'));
  }, Math.max(1, timeoutMs));

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      parent.removeEventListener('abort', onAbort);
    },
  };
}
