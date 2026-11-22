import { describe, expect, it } from 'vitest';
import { formatBytes, formatClock, formatPercent, formatUptime, formatVersion } from '../../src/shared/format';

describe('formatVersion', () => {
  it('prefixes bare semantic versions', () => {
    expect(formatVersion('45.4.1')).toBe('v45.4.1');
  });

  it('preserves an existing v prefix without duplicating it', () => {
    expect(formatVersion(' v26.13.0 ')).toBe('v26.13.0');
  });
});

describe('formatUptime', () => {
  it('formats seconds, minutes, and hours', () => {
    expect(formatUptime(9_000)).toBe('9s');
    expect(formatUptime(95_000)).toBe('1m 35s');
    expect(formatUptime(3_661_000)).toBe('1h 1m');
  });

  it('rejects invalid durations', () => {
    expect(formatUptime(-1)).toBe('unknown');
    expect(formatUptime(Number.NaN)).toBe('unknown');
  });
});

describe('formatBytes', () => {
  it('formats bytes and larger units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KiB');
    expect(formatBytes(1572864)).toBe('1.5 MiB');
  });

  it('rejects invalid sizes', () => {
    expect(formatBytes(-1)).toBe('\u2014');
    expect(formatBytes(Number.NaN)).toBe('\u2014');
  });
});

describe('formatPercent', () => {
  it('formats percentages with one decimal', () => {
    expect(formatPercent(42.25)).toBe('42.3%');
    expect(formatPercent(Number.NaN)).toBe('\u2014');
  });
});

describe('formatClock', () => {
  it('zero-pads clock components', () => {
    const timestamp = new Date(2026, 0, 1, 9, 5, 7).getTime();
    expect(formatClock(timestamp)).toBe('09:05:07');
  });
});
