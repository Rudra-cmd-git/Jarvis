import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import {
  PROVIDER_PROTOCOLS,
  type ProviderInput,
  type ProviderProtocol,
  type ProviderSummary,
} from '../../shared/providers';
import { getCoreServices } from '../services/core-services';
import { assertNoArguments, assertTrustedRenderer } from '../utils/ipc-guard';
import {
  asBoolean,
  asEnum,
  asInteger,
  asOptionalString,
  asRecord,
  asString,
  asStringArray,
  assertArgumentCount,
  assertKeys,
  toPublicErrorMessage,
} from '../utils/validation';

const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

function parseProviderInput(payload: Record<string, unknown>): ProviderInput {
  return {
    id: asOptionalString(payload.id, 'id', {
      min: 1,
      max: 120,
      pattern: PROVIDER_ID_PATTERN,
    }),
    name: asString(payload.name, 'name', { min: 1, max: 80 }),
    protocol: asEnum<ProviderProtocol>(payload.protocol, PROVIDER_PROTOCOLS, 'protocol'),
    baseUrl: asString(payload.baseUrl, 'baseUrl', { min: 1, max: 500 }),
    modelIds: asStringArray(payload.modelIds, 'modelIds', {
      minItems: 1,
      maxItems: 20,
      maxLength: 120,
    }),
    enabled: asBoolean(payload.enabled, 'enabled'),
    priority: asInteger(payload.priority, 'priority', { min: 0, max: 1000 }),
  };
}

function parseProviderId(value: unknown): string {
  return asString(value, 'id', { min: 1, max: 120, pattern: PROVIDER_ID_PATTERN });
}

export function registerProvidersIpc(): void {
  ipcMain.removeHandler(IPC_CHANNELS.PROVIDERS_LIST);
  ipcMain.handle(IPC_CHANNELS.PROVIDERS_LIST, async (event, ...args): Promise<ProviderSummary[]> => {
    assertTrustedRenderer(event);
    assertNoArguments(args);
    return getCoreServices().providers.list();
  });

  ipcMain.removeHandler(IPC_CHANNELS.PROVIDERS_SAVE);
  ipcMain.handle(
    IPC_CHANNELS.PROVIDERS_SAVE,
    async (event, ...args): Promise<ProviderSummary> => {
      assertTrustedRenderer(event);
      assertArgumentCount(args, 1);

      const payload = asRecord(args[0], 'payload');
      assertKeys(
        payload,
        ['id', 'name', 'protocol', 'baseUrl', 'modelIds', 'enabled', 'priority'],
        'payload',
      );
      const input = parseProviderInput(payload);

      try {
        return getCoreServices().providers.save(input);
      } catch (error) {
        throw new Error(toPublicErrorMessage(error, 'Provider could not be saved.'));
      }
    },
  );

  ipcMain.removeHandler(IPC_CHANNELS.PROVIDERS_REMOVE);
  ipcMain.handle(
    IPC_CHANNELS.PROVIDERS_REMOVE,
    async (event, ...args): Promise<{ removed: boolean }> => {
      assertTrustedRenderer(event);
      assertArgumentCount(args, 1);

      const payload = asRecord(args[0], 'payload');
      assertKeys(payload, ['id'], 'payload');
      const id = parseProviderId(payload.id);

      try {
        return { removed: getCoreServices().providers.remove(id) };
      } catch (error) {
        throw new Error(toPublicErrorMessage(error, 'Provider could not be removed.'));
      }
    },
  );

  ipcMain.removeHandler(IPC_CHANNELS.PROVIDERS_SET_ACTIVE);
  ipcMain.handle(
    IPC_CHANNELS.PROVIDERS_SET_ACTIVE,
    async (event, ...args): Promise<ProviderSummary[]> => {
      assertTrustedRenderer(event);
      assertArgumentCount(args, 1);

      const payload = asRecord(args[0], 'payload');
      assertKeys(payload, ['id'], 'payload');
      const id = parseProviderId(payload.id);

      try {
        return getCoreServices().providers.setActive(id);
      } catch (error) {
        throw new Error(toPublicErrorMessage(error, 'Provider could not be activated.'));
      }
    },
  );
}
