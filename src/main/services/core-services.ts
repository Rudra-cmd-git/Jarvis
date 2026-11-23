import path from 'node:path';
import type { CoreStatus, DatabaseStatus } from '../../shared/types';
import { AiService } from './ai/ai.service';
import { ModelRouter } from './ai/model-router';
import { createDefaultProviderRegistry } from './ai/provider-registry';
import { ActivityLogService } from './activity-log.service';
import { ConversationService } from './conversation.service';
import { DatabaseService } from './database.service';
import { PermissionsService } from './permissions.service';
import { ProvidersService } from './providers.service';
import { SecretsService } from './secrets.service';
import type { SecretCipher } from './secret-cipher';
import { SettingsService } from './settings.service';

export interface CoreServices {
  database: DatabaseService;
  settings: SettingsService;
  secrets: SecretsService;
  permissions: PermissionsService;
  activity: ActivityLogService;
  providers: ProvidersService;
  conversations: ConversationService;
  ai: AiService;
  getStatus(): CoreStatus;
}

export interface CreateCoreOptions {
  userDataPath: string;
  cipher: SecretCipher;
}

function safeMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Core services failed to initialize.';
}

export function createCoreServices({ userDataPath, cipher }: CreateCoreOptions): CoreServices {
  const database = new DatabaseService(path.join(userDataPath, 'jarvis.db'));
  const secrets = new SecretsService(path.join(userDataPath, 'secrets.bin'), cipher);

  try {
    database.initialize();
  } catch (error) {
    database.close();
    throw new Error(safeMessage(error));
  }

  const activity = new ActivityLogService(database);
  const settings = new SettingsService(database);
  const permissions = new PermissionsService(database, activity);
  const providers = new ProvidersService(database, settings, secrets, activity);
  const conversations = new ConversationService(database, activity);
  const ai = new AiService({
    registry: createDefaultProviderRegistry(),
    router: new ModelRouter(providers, settings, secrets),
    permissions,
    activity,
  });

  const getStatus = (): CoreStatus => ({
    database: database.getStatus(),
    secretStorage: secrets.status(),
  });

  const status = getStatus();
  activity.tryRecord({
    category: 'database',
    severity: 'info',
    action: 'database.initialized',
    outcome: 'success',
    detail: `Schema version ${status.database.schemaVersion}; journal ${status.database.journalMode}.`,
  });
  activity.tryRecord({
    category: 'app',
    severity: 'info',
    action: 'app.core_initialized',
    outcome: 'success',
    detail: `Secret storage ${status.secretStorage.available ? 'available' : 'unavailable'}.`,
  });

  return {
    database,
    settings,
    secrets,
    permissions,
    activity,
    providers,
    conversations,
    ai,
    getStatus,
  };
}

let active: CoreServices | null = null;
let lastStatus: CoreStatus | null = null;

function fallbackStatus(userDataPath: string, cipher: SecretCipher, error: string): CoreStatus {
  const secrets = new SecretsService(path.join(userDataPath, 'secrets.bin'), cipher);
  const database: DatabaseStatus = {
    initialized: false,
    filePath: path.join(userDataPath, 'jarvis.db'),
    schemaVersion: 0,
    journalMode: 'unknown',
    appliedMigrations: [],
    error,
  };

  return { database, secretStorage: secrets.status() };
}

export function initializeCoreServices(options: CreateCoreOptions): CoreStatus {
  if (active) {
    return active.getStatus();
  }

  try {
    active = createCoreServices(options);
    lastStatus = active.getStatus();
  } catch (error) {
    active = null;
    lastStatus = fallbackStatus(options.userDataPath, options.cipher, safeMessage(error));
  }

  return getCoreStatus();
}

export function getCoreServices(): CoreServices {
  if (!active) {
    throw new Error('Core services are not initialized.');
  }
  return active;
}

export function getCoreStatus(): CoreStatus {
  if (active) {
    return active.getStatus();
  }

  return (
    lastStatus ?? {
      database: {
        initialized: false,
        filePath: '',
        schemaVersion: 0,
        journalMode: 'unknown',
        appliedMigrations: [],
        error: 'Core services are not initialized.',
      },
      secretStorage: {
        available: false,
        backend: 'unknown',
        entryCount: 0,
        error: null,
      },
    }
  );
}

export function shutdownCoreServices(): void {
  if (active) {
    // Abort provider sockets before the database handle disappears; audit
    // writes are best-effort and never break shutdown.
    active.ai.shutdown();
    active.database.close();
    lastStatus = {
      ...active.getStatus(),
      database: { ...active.database.getStatus(), initialized: false },
    };
    active = null;
  }
}
