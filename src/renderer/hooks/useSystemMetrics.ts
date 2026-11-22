import { useCallback, useEffect, useRef, useState } from 'react';
import type { SystemMetrics } from '../../shared/types';

export interface SystemMetricsState {
  metrics: SystemMetrics | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSystemMetrics(intervalMs = 3000): SystemMetricsState {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const request = useCallback(
    async (manual: boolean) => {
      if (inFlight.current) {
        return;
      }

      inFlight.current = true;
      if (manual) {
        setRefreshing(true);
      }

      try {
        const next = await window.jarvis.getSystemMetrics();
        if (!mounted.current) {
          return;
        }
        setMetrics(next);
        setError(null);
      } catch (cause) {
        if (!mounted.current) {
          return;
        }
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (mounted.current) {
          setRefreshing(false);
        }
        inFlight.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    mounted.current = true;
    void request(false);

    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void request(false);
      }
    }, intervalMs);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void request(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intervalMs, request]);

  const loading = metrics === null && error === null;

  return {
    metrics,
    loading,
    refreshing,
    error,
    refresh: () => request(true),
  };
}
