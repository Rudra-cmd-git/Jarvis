export function formatVersion(value: string): string {
  const trimmed = value.trim();
  return /^v\d+/i.test(trimmed) ? trimmed : `v${trimmed}`;
}

export function formatUptime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return 'unknown';
  }

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  if (bytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const digits = exponent === 0 ? 0 : value >= 100 ? 0 : 1;

  return `${value.toFixed(digits)} ${units[exponent]}`;
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(digits)}%`;
}

export function formatClock(timestamp: number, includeSeconds = true): string {
  if (!Number.isFinite(timestamp)) {
    return '—';
  }

  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return includeSeconds ? `${time}:${pad(date.getSeconds())}` : time;
}

export function formatDateTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) {
    return '—';
  }

  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${formatClock(timestamp)}`;
}
