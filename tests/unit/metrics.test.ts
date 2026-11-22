import { describe, expect, it } from 'vitest';
import { clampPercent, computeCpuUsage, computeUsagePercent, roundPercent } from '../../src/shared/metrics';

describe('shared metrics', () => {
  it('clamps percentages to the valid range', () => {
    expect(clampPercent(-1)).toBe(0);
    expect(clampPercent(42.25)).toBe(42.25);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
  });

  it('computes CPU usage from cumulative idle and total times', () => {
    expect(
      computeCpuUsage(
        { idle: 100, total: 200 },
        { idle: 120, total: 300 },
      ),
    ).toBe(80);
  });

  it('returns zero for invalid or non-increasing CPU samples', () => {
    expect(computeCpuUsage({ idle: 100, total: 200 }, { idle: 90, total: 180 })).toBe(0);
    expect(computeCpuUsage({ idle: 100, total: 200 }, { idle: 100, total: 200 })).toBe(0);
  });

  it('computes memory and storage usage', () => {
    expect(computeUsagePercent(100, 25)).toBe(75);
    expect(computeUsagePercent(0, 0)).toBe(0);
    expect(computeUsagePercent(100, 150)).toBe(0);
  });

  it('rounds percentages for display', () => {
    expect(roundPercent(42.26)).toBe(42.3);
    expect(roundPercent(100.4)).toBe(100);
  });
});
