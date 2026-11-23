import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SecretCipher } from '../../src/main/services/secret-cipher';
import {
  SecretStorageUnavailableError,
  SecretStoreCorruptError,
  SecretValidationError,
} from '../../src/main/services/secret-cipher';
import { SecretsService } from '../../src/main/services/secrets.service';

const tempDirectories: string[] = [];

function tempFile(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-secrets-test-'));
  tempDirectories.push(directory);
  return path.join(directory, 'secrets.bin');
}

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (directory) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

/** Deterministic reversible transform; deliberately not real encryption. */
class FakeCipher implements SecretCipher {
  readonly backend = 'fake-cipher';
  available = true;
  failEncrypt = false;

  isAvailable(): boolean {
    return this.available;
  }

  encrypt(plaintext: string): Buffer {
    if (this.failEncrypt) {
      throw new Error('encrypt failed');
    }
    return Buffer.from(`fake:${Buffer.from(plaintext, 'utf8').toString('base64')}`, 'utf8');
  }

  decrypt(ciphertext: Buffer): string {
    const raw = ciphertext.toString('utf8');
    if (!raw.startsWith('fake:')) {
      throw new Error('bad ciphertext');
    }
    return Buffer.from(raw.slice(5), 'base64').toString('utf8');
  }
}

describe('SecretsService', () => {
  it('stores ciphertext only and round-trips in the main process', () => {
    const filePath = tempFile();
    const service = new SecretsService(filePath, new FakeCipher());
    const plaintext = 'sk-test-dummy-value-123456';

    service.setSecret('provider:demo', plaintext);

    const onDisk = fs.readFileSync(filePath, 'utf8');
    expect(onDisk).not.toContain(plaintext);
    expect(service.hasSecret('provider:demo')).toBe(true);
    expect(service.getSecretInternal('provider:demo')).toBe(plaintext);
    expect(service.status().entryCount).toBe(1);
  });

  it('refuses to save when secure storage is unavailable', () => {
    const cipher = new FakeCipher();
    cipher.available = false;
    const service = new SecretsService(tempFile(), cipher);

    expect(() => service.setSecret('provider:demo', 'value')).toThrow(
      SecretStorageUnavailableError,
    );
    expect(service.status().entryCount).toBe(0);
  });

  it('never falls back to plaintext when encryption fails', () => {
    const filePath = tempFile();
    const cipher = new FakeCipher();
    cipher.failEncrypt = true;
    const service = new SecretsService(filePath, cipher);

    expect(() => service.setSecret('provider:demo', 'value')).toThrow();
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('rejects invalid references and empty values', () => {
    const service = new SecretsService(tempFile(), new FakeCipher());

    expect(() => service.setSecret('bad id!', 'value')).toThrow(SecretValidationError);
    expect(() => service.setSecret('provider:demo', '')).toThrow(SecretValidationError);
    expect(() => service.hasSecret('')).toThrow(SecretValidationError);
  });

  it('deletes entries and reports missing entries truthfully', () => {
    const service = new SecretsService(tempFile(), new FakeCipher());
    service.setSecret('provider:demo', 'value');

    expect(service.deleteSecret('provider:demo')).toBe(true);
    expect(service.deleteSecret('provider:demo')).toBe(false);
    expect(service.hasSecret('provider:demo')).toBe(false);
  });

  it('reports a corrupt store without overwriting it', () => {
    const filePath = tempFile();
    fs.writeFileSync(filePath, 'not-json', 'utf8');
    const service = new SecretsService(filePath, new FakeCipher());

    expect(service.status().error).toBeTruthy();
    expect(() => service.hasSecret('provider:demo')).toThrow(SecretStoreCorruptError);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('not-json');
  });
});
