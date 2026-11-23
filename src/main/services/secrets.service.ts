import fs from 'node:fs';
import path from 'node:path';
import type { SecretStorageStatus } from '../../shared/types';
import {
  SecretDecryptionError,
  SecretEncryptionError,
  SecretNotFoundError,
  SecretStoreCorruptError,
  SecretStorageUnavailableError,
  SecretValidationError,
  type SecretCipher,
} from './secret-cipher';

interface StoredSecret {
  ciphertext: string;
  updatedAt: number;
}

interface SecretFile {
  version: 1;
  entries: Record<string, StoredSecret>;
}

const SECRET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/;
const MAX_SECRET_LENGTH = 8192;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class SecretsService {
  constructor(
    private readonly filePath: string,
    private readonly cipher: SecretCipher,
  ) {}

  isAvailable(): boolean {
    try {
      return this.cipher.isAvailable();
    } catch {
      return false;
    }
  }

  status(): SecretStorageStatus {
    const available = this.isAvailable();

    try {
      const store = this.readStore();
      return {
        available,
        backend: this.cipher.backend,
        entryCount: Object.keys(store.entries).length,
        error: null,
      };
    } catch (error) {
      return {
        available,
        backend: this.cipher.backend,
        entryCount: 0,
        error: error instanceof Error ? error.message : 'The credential store could not be read.',
      };
    }
  }

  setSecret(id: string, plaintext: string): { id: string; updatedAt: number } {
    this.assertValidId(id);
    this.assertValidValue(plaintext);

    if (!this.isAvailable()) {
      throw new SecretStorageUnavailableError();
    }

    let ciphertext: Buffer;
    try {
      ciphertext = this.cipher.encrypt(plaintext);
    } catch {
      throw new SecretEncryptionError();
    }

    if (!Buffer.isBuffer(ciphertext) || ciphertext.length === 0) {
      throw new SecretEncryptionError();
    }

    const store = this.readStore();
    const updatedAt = Date.now();
    store.entries[id] = { ciphertext: ciphertext.toString('base64'), updatedAt };
    this.writeStore(store);

    return { id, updatedAt };
  }

  hasSecret(id: string): boolean {
    this.assertValidId(id);
    return Boolean(this.readStore().entries[id]);
  }

  /**
   * Main-process only. This method must never be wired to an IPC channel.
   */
  getSecretInternal(id: string): string {
    this.assertValidId(id);

    if (!this.isAvailable()) {
      throw new SecretStorageUnavailableError();
    }

    const store = this.readStore();
    const entry = store.entries[id];
    if (!entry) {
      throw new SecretNotFoundError();
    }

    try {
      const plaintext = this.cipher.decrypt(Buffer.from(entry.ciphertext, 'base64'));
      if (typeof plaintext !== 'string' || plaintext.length === 0) {
        throw new SecretDecryptionError();
      }
      return plaintext;
    } catch (error) {
      if (error instanceof SecretDecryptionError) {
        throw error;
      }
      throw new SecretDecryptionError();
    }
  }

  deleteSecret(id: string): boolean {
    this.assertValidId(id);
    const store = this.readStore();

    if (!store.entries[id]) {
      return false;
    }

    delete store.entries[id];
    this.writeStore(store);
    return true;
  }

  private assertValidId(id: string): void {
    if (typeof id !== 'string' || !SECRET_ID_PATTERN.test(id)) {
      throw new SecretValidationError('Credential reference is invalid.');
    }
  }

  private assertValidValue(value: string): void {
    if (typeof value !== 'string' || value.length < 1 || value.length > MAX_SECRET_LENGTH) {
      throw new SecretValidationError(
        `Credential must be between 1 and ${MAX_SECRET_LENGTH} characters.`,
      );
    }
  }

  private readStore(): SecretFile {
    if (!fs.existsSync(this.filePath)) {
      return { version: 1, entries: {} };
    }

    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch {
      throw new SecretStoreCorruptError();
    }

    if (!raw.trim()) {
      throw new SecretStoreCorruptError();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new SecretStoreCorruptError();
    }

    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.entries)) {
      throw new SecretStoreCorruptError();
    }

    const entries: Record<string, StoredSecret> = {};
    for (const [id, value] of Object.entries(parsed.entries)) {
      if (
        !SECRET_ID_PATTERN.test(id) ||
        !isRecord(value) ||
        typeof value.ciphertext !== 'string' ||
        value.ciphertext.length === 0 ||
        typeof value.updatedAt !== 'number' ||
        !Number.isFinite(value.updatedAt)
      ) {
        throw new SecretStoreCorruptError();
      }
      entries[id] = { ciphertext: value.ciphertext, updatedAt: value.updatedAt };
    }

    return { version: 1, entries };
  }

  private writeStore(store: SecretFile): void {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });

    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    const serialized = JSON.stringify(store, null, 2);

    try {
      fs.writeFileSync(temporaryPath, serialized, { encoding: 'utf8', mode: 0o600 });
      try {
        fs.renameSync(temporaryPath, this.filePath);
      } catch {
        // Windows can reject a replace-rename while the destination exists.
        fs.rmSync(this.filePath, { force: true });
        fs.renameSync(temporaryPath, this.filePath);
      }
    } catch {
      try {
        fs.rmSync(temporaryPath, { force: true });
      } catch {
        // Best-effort cleanup; the file contains ciphertext only.
      }
      throw new SecretEncryptionError();
    }
  }
}
