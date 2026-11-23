import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_SEVERITIES,
  type ActivityCategory,
  type ActivityEntry,
  type ActivityFilter,
  type ActivitySeverity,
} from '../../shared/types';
import { getCoreServices } from '../services/core-services';
import { assertTrustedRenderer } from '../utils/ipc-guard';
import {
  asEnum,
  asInteger,
  asRecord,
  asString,
  assertKeys,
} from '../utils/validation';

function parseFilter(value: unknown): ActivityFilter {
  const payload = asRecord(value, 'filter');
  assertKeys(payload, ['category', 'severity', 'limit', 'query'], 'filter');

  const filter: ActivityFilter = {};

  if (payload.category !== undefined) {
    filter.category = asEnum<ActivityCategory>(
      payload.category,
      ACTIVITY_CATEGORIES,
      'category',
    );
  }
  if (payload.severity !== undefined) {
    filter.severity = asEnum<ActivitySeverity>(
      payload.severity,
      ACTIVITY_SEVERITIES,
      'severity',
    );
  }
  if (payload.limit !== undefined) {
    filter.limit = asInteger(payload.limit, 'limit', { min: 1, max: 200 });
  }
  if (payload.query !== undefined) {
    filter.query = asString(payload.query, 'query', { min: 0, max: 200 });
  }

  return filter;
}

export function registerActivityIpc(): void {
  ipcMain.removeHandler(IPC_CHANNELS.ACTIVITY_LIST);
  ipcMain.handle(
    IPC_CHANNELS.ACTIVITY_LIST,
    async (event, ...args): Promise<ActivityEntry[]> => {
      assertTrustedRenderer(event);
      if (args.length > 1) {
        throw new Error('Unexpected IPC arguments');
      }
      const filter = args.length === 0 ? {} : parseFilter(args[0]);
      return getCoreServices().activity.list(filter);
    },
  );
}
