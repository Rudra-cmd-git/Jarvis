export interface CpuSample {
  idle: number;
  total: number;
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

export function roundPercent(value: number): number {
  return Math.round(clampPercent(value) * 10) / 10;
}

export function computeCpuUsage(previous: CpuSample, current: CpuSample): number {
  const idleDelta = current.idle - previous.idle;
  const totalDelta = current.total - previous.total;

  if (!Number.isFinite(idleDelta) || !Number.isFinite(totalDelta) || totalDelta <= 0) {
    return 0;
  }

  return clampPercent(((totalDelta - idleDelta) / totalDelta) * 100);
}

export function computeUsagePercent(total: number, free: number): number {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(free) || free < 0) {
    return 0;
  }

  return clampPercent(((total - free) / total) * 100);
}
