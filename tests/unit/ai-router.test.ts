import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SecretCipher } from '../../src/main/services/secret-cipher';
import { ActivityLogService } from '../../src/main/services/activity-log.service';
import { DatabaseService } from '../../src/main/services/database.service';
import { ModelRouter } from '../../src/main/services/ai/model-router';
import { ProvidersService } from '../../src/main/services/providers.service';
import { SecretsService } from '../../src/main/services/secrets.service';
import { SettingsService } from '../../src/main/services/settings.service';
import { providerSecretId } from '../../src/shared/providers';

class FakeCipher implements SecretCipher {
  readonly backend = 'fake-cipher';
  isAvailable(): boolean {
    return true;
  }
  encrypt(plaintext: string): Buffer {
    return Buffer.from(`fake:${Buffer.from(plaintext, 'utf8').toString('base64')}`);
  }
  decrypt(ciphertext: Buffer): string {
    return Buffer.from(ciphertext.toString('utf8').slice(5), 'base64').toString('utf8');
  }
}

let directory: string;
let database: DatabaseService;
let settings: SettingsService;
let secrets: SecretsService;
let providers: ProvidersService;
let router: ModelRouter;

const input = {
  name: 'Router Provider',
  protocol: 'openai-compatible' as const,
  baseUrl: 'https://router.test/v1',
  modelIds: ['model-a', 'model-b'],
  enabled: true,
  priority: 10,
};

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-ai-router-'));
  database = new DatabaseService(path.join(directory, 'jarvis.db'));
  database.initialize();
  settings = new SettingsService(database);
  secrets = new SecretsService(path.join(directory, 'secrets.bin'), new FakeCipher());
  providers = new ProvidersService(database, settings, secrets, new ActivityLogService(database));
  router = new ModelRouter(providers, settings, secrets);
});

afterEach(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('ModelRouter', () => {
  it('resolves the active provider, default model and decrypted key', () => {
    const provider = providers.save(input);
    secrets.setSecret(providerSecretId(provider.id), 'dummy-key-value');
    providers.setActive(provider.id);

    expect(router.resolve()).toMatchObject({
      providerId: provider.id,
      providerName: 'Router Provider',
      protocol: 'openai-compatible',
      baseUrl: 'https://router.test/v1',
      model: 'model-a',
      apiKey: 'dummy-key-value',
      credentialState: 'configured',
    });
    expect(router.resolve('model-b')).toMatchObject({ model: 'model-b' });
    expect(router.resolve('model-b', provider.id)).toMatchObject({ model: 'model-b' });
  });

  it('reports missing and disabled providers as normalized errors', () => {
    expect(() => router.resolve()).toThrowError(/No active AI provider/);

    const disabled = providers.save({ ...input, enabled: false });
    settings.set('ai.activeProviderId', disabled.id);
    expect(() => router.resolve()).toThrowError(/disabled/);

    settings.set('ai.activeProviderId', 'missing-provider');
    expect(() => router.resolve()).toThrowError(/no longer exists/);
  });

  it('fails clearly when the active provider has no model', () => {
    const provider = providers.save(input);
    providers.setActive(provider.id);
    database.db
      .prepare('UPDATE provider_configs SET model_ids_json = ? WHERE id = ?')
      .run('[]', provider.id);
    settings.set('ai.defaultModel', '');

    expect(() => router.resolve()).toThrowError(/No model is selected/);
  });

  it('does not leak a corrupt credential and returns a normalized error', () => {
    const provider = providers.save(input);
    providers.setActive(provider.id);
    fs.writeFileSync(path.join(directory, 'secrets.bin'), 'not-valid-json');

    expect(() => router.resolve()).toThrowError(/could not be read/);
  });

  it('keeps provider details in the status description even when unusable', () => {
    const provider = providers.save({ ...input, enabled: false });
    settings.set('ai.activeProviderId', provider.id);

    const described = router.describe();
    expect(described.provider?.id).toBe(provider.id);
    expect(described.config).toBeNull();
    expect(described.error?.code).toBe('provider_disabled');
  });

  it('propagates provider lookup failures from explicit ids', () => {
    expect(() => router.resolveConfig('missing')).toThrowError(/no longer exists/);
  });
});
