import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import type { StorageMetrics, SystemMetrics } from '../../shared/types';
import {
  computeCpuUsage,
  computeUsagePercent,
  roundPercent,
  type CpuSample,
} from '../../shared/metrics';

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

export class SystemMonitorService {
  private previousCpu: CpuSample | null = null;
  private cpuSampleInFlight: Promise<number> | null = null;

  private readCpuSample(): CpuSample {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
      idle += cpu.times.idle;
      total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
    }

    return { idle, total };
  }

  private async readCpuUsage(): Promise<number> {
    if (this.cpuSampleInFlight) {
      return this.cpuSampleInFlight;
    }

    this.cpuSampleInFlight = (async (): Promise<number> => {
      if (!this.previousCpu) {
        this.previousCpu = this.readCpuSample();
        await delay(200);
      }

      const current = this.readCpuSample();
      const usage = computeCpuUsage(this.previousCpu, current);
      this.previousCpu = current;

      return roundPercent(usage);
    })();

    try {
      return await this.cpuSampleInFlight;
    } finally {
      this.cpuSampleInFlight = null;
    }
  }

  private async readStorage(): Promise<StorageMetrics> {
    const userDataPath = app.getPath('userData');
    const mount = path.parse(userDataPath).root || userDataPath;

    try {
      const stats = await fs.statfs(mount);
      const totalBytes = Number(stats.bsize) * Number(stats.blocks);
      const freeBytes = Number(stats.bsize) * Number(stats.bavail);

      if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
        throw new Error('Storage capacity could not be read');
      }

      return {
        available: true,
        mount,
        totalBytes,
        freeBytes: Math.max(0, freeBytes),
        usedBytes: Math.max(0, totalBytes - Math.max(0, freeBytes)),
        usagePercent: roundPercent(computeUsagePercent(totalBytes, Math.max(0, freeBytes))),
        detail: `${stats.bsize}-byte blocks`,
      };
    } catch (error) {
      return {
        available: false,
        mount,
        totalBytes: null,
        freeBytes: null,
        usedBytes: null,
        usagePercent: null,
        detail: error instanceof Error ? error.message : 'Storage capacity could not be read',
      };
    }
  }

  async getMetrics(): Promise<SystemMetrics> {
    const cpus = os.cpus();
    const [cpuUsage, storage] = await Promise.all([this.readCpuUsage(), this.readStorage()]);
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const processMemory = process.memoryUsage();

    return {
      sampledAt: Date.now(),
      cpu: {
        usagePercent: cpuUsage,
        cores: cpus.length,
        model: cpus[0]?.model?.trim() || 'Unknown CPU',
      },
      memory: {
        totalBytes: totalMemory,
        freeBytes: freeMemory,
        usedBytes: Math.max(0, totalMemory - freeMemory),
        usagePercent: roundPercent(computeUsagePercent(totalMemory, freeMemory)),
      },
      storage,
      process: {
        pid: process.pid,
        rssBytes: processMemory.rss,
        heapUsedBytes: processMemory.heapUsed,
        heapTotalBytes: processMemory.heapTotal,
        uptimeSeconds: Math.floor(process.uptime()),
      },
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        uptimeSeconds: Math.floor(os.uptime()),
      },
    };
  }
}

export const systemMonitor = new SystemMonitorService();
