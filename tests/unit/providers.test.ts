import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SecretCipher } from '../../src/main/services/secret-cipher';
import { ActivityLogService } from '../../src/main/services/activity-log.service';
import { DatabaseService } from '../../src/main/services/database.service';
import {
  ProviderNotFoundError,
  ProviderValidationError,
  ProvidersService,
} from '../../src/main/services/providers.service';
import { SecretsService } from '../../src/main/services/secrets.service';
import { SettingsService } from '../../src/main/services/settings.service';
import { validateProviderInput } from '../../src/shared/providers';

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
let activity: ActivityLogService;
let providers: ProvidersService;

const baseInput = {
  name: 'Demo Provider',
  protocol: 'openai-compatible' as const,
  baseUrl: 'https://api.example.test/v1',
  modelIds: ['model-a', 'model-b'],
  enabled: true,
  priority: 100,
};

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-providers-test-'));
  database = new DatabaseService(path.join(directory, 'jarvis.db'));
  database.initialize();
  settings = new SettingsService(database);
  secrets = new SecretsService(path.join(directory, 'secrets.bin'), new FakeCipher());
  activity = new ActivityLogService(database);
  providers = new ProvidersService(database, settings, secrets, activity);
});

afterEach(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('ProvidersService', () => {
  it('creates, lists, and updates providers', () => {
    const created = providers.save(baseInput);

    expect(created.id).toBeTruthy();
    expect(created.name).toBe('Demo Provider');
    expect(created.modelIds).toEqual(['model-a', 'model-b']);
    expect(created.credentialState).toBe('missing');
    expect(created.isActive).toBe(false);

    const updated = providers.save({ ...baseInput, id: created.id, name: 'Renamed' });
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Renamed');
    expect(providers.list()).toHaveLength(1);
  });

  it('normalizes duplicate and whitespace model identifiers', () => {
    const created = providers.save({
      ...baseInput,
      modelIds: [' model-a ', 'model-a', 'model-b', '   '],
    });
    expect(created.modelIds).toEqual(['model-a', 'model-b']);
  });

  it('rejects invalid provider input', () => {
    expect(() => providers.save({ ...baseInput, name: '' })).toThrow(ProviderValidationError);
    expect(() => providers.save({ ...baseInput, baseUrl: 'not-a-url' })).toThrow(
      ProviderValidationError,
    );
    expect(() => providers.save({ ...baseInput, baseUrl: 'ftp://example.test' })).toThrow(
      ProviderValidationError,
    );
    expect(() => providers.save({ ...baseInput, modelIds: [] })).toThrow(ProviderValidationError);
  });

  it('activates an enabled provider and selects a default model', () => {
    const created = providers.save(baseInput);
    providers.setActive(created.id);

    expect(settings.get('ai.activeProviderId')).toBe(created.id);
    expect(settings.get('ai.defaultModel')).toBe('model-a');
    expect(providers.list()[0].isActive).toBe(true);
  });

  it('refuses to activate a disabled provider', () => {
    const created = providers.save({ ...baseInput, enabled: false });
    expect(() => providers.setActive(created.id)).toThrow(ProviderValidationError);
  });

  it('reports credential state without exposing the credential', () => {
    const created = providers.save(baseInput);
    secrets.setSecret(`provider:${created.id}`, 'dummy-key-value');

    const summary = providers.list()[0];
    expect(summary.credentialState).toBe('configured');
    expect(JSON.stringify(summary)).not.toContain('dummy-key-value');
  });

  it('removes a provider, its credential, and active selection', () => {
    const created = providers.save(baseInput);
    secrets.setSecret(`provider:${created.id}`, 'dummy-key-value');
    providers.setActive(created.id);

    expect(providers.remove(created.id)).toBe(true);
    expect(providers.remove(created.id)).toBe(false);
    expect(providers.list()).toHaveLength(0);
    expect(secrets.hasSecret(`provider:${created.id}`)).toBe(false);
    expect(settings.get('ai.activeProviderId')).toBeNull();
  });

  it('throws for unknown provider ids on update and activation', () => {
    expect(() => providers.save({ ...baseInput, id: 'missing' })).toThrow(ProviderNotFoundError);
    expect(() => providers.setActive('missing')).toThrow(ProviderNotFoundError);
  });

  it('logs provider lifecycle events without secrets', () => {
    const created = providers.save(baseInput);
    providers.setActive(created.id);
    providers.remove(created.id);

    const actions = activity.list({ category: 'provider' }).map((entry) => entry.action);
    expect(actions).toEqual(['provider.removed', 'provider.activated', 'provider.created']);
  });
});

describe('validateProviderInput', () => {
  it('rejects embedded credentials and fragments in the base URL', () => {
    expect(validateProviderInput({ ...baseInput, baseUrl: 'https://user:pass@example.test/v1' }).valid).toBe(false);
    expect(validateProviderInput({ ...baseInput, baseUrl: 'https://example.test/v1#frag' }).valid).toBe(false);
  });

  it('accepts local http endpoints', () => {
    expect(validateProviderInput({ ...baseInput, baseUrl: 'http://127.0.0.1:11434/v1' }).valid).toBe(true);
  });
});
