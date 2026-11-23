import { describe, expect, it, vi } from 'vitest';
import type { AiError } from '../../src/shared/ai';
import {
  DEFAULT_RETRY_POLICY,
  createTimeoutSignal,
  retryDelayMs,
  shouldRetry,
  sleepWithSignal,
} from '../../src/main/services/ai/retry';

describe('AI retry policy', () => {
  it('retries only retryable failures before content', () => {
    const retryable: AiError = {
      code: 'network_error',
      message: 'offline',
      retryable: true,
    };
    const permanent: AiError = {
      code: 'http_error',
      message: 'bad request',
      retryable: false,
    };

    expect(shouldRetry(retryable, 1, false)).toBe(true);
    expect(shouldRetry(retryable, 1, true)).toBe(false);
    expect(shouldRetry(permanent, 1, false)).toBe(false);
    expect(shouldRetry(retryable, 3, false)).toBe(false);
  });

  it('uses exponential backoff with a cap', () => {
    const policy = { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 250 };
    expect(retryDelayMs(1, policy)).toBe(100);
    expect(retryDelayMs(2, policy)).toBe(200);
    expect(retryDelayMs(3, policy)).toBe(250);
    expect(retryDelayMs(1)).toBe(DEFAULT_RETRY_POLICY.baseDelayMs);
  });

  it('resolves sleep as false when cancelled', async () => {
    const controller = new AbortController();
    const pending = sleepWithSignal(5_000, controller.signal);
    controller.abort();
    expect(await pending).toBe(false);
  });

  it('distinguishes timeout cancellation from user cancellation', async () => {
    const user = new AbortController();
    const timed = createTimeoutSignal(user.signal, 5);
    expect(timed.timedOut()).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(timed.timedOut()).toBe(true);
    expect(timed.signal.aborted).toBe(true);
    timed.cleanup();

    const cancelled = createTimeoutSignal(user.signal, 5_000);
    user.abort();
    expect(cancelled.signal.aborted).toBe(true);
    expect(cancelled.timedOut()).toBe(false);
    cancelled.cleanup();
  });

  it('notifies the linked signal when the parent aborts', () => {
    const parent = new AbortController();
    const linked = createTimeoutSignal(parent.signal, 5_000);
    const listener = vi.fn();
    linked.signal.addEventListener('abort', listener);
    parent.abort('user cancel');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(linked.signal.reason).toBe('user cancel');
    linked.cleanup();
  });
});
