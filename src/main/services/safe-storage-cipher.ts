import { safeStorage } from 'electron';
import {
  SecretStorageUnavailableError,
  type SecretCipher,
} from './secret-cipher';

/**
 * Electron 45 marks the synchronous safeStorage methods as deprecated in
 * favour of async variants. This milestone explicitly requires
 * `safeStorage.isEncryptionAvailable()` and synchronous main-process storage;
 * the async migration is recorded as a follow-up in HANDOFF.md.
 */
export class SafeStorageCipher implements SecretCipher {
  readonly backend = 'electron-safe-storage';

  isAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  encrypt(plaintext: string): Buffer {
    if (!this.isAvailable()) {
      throw new SecretStorageUnavailableError();
    }
    return safeStorage.encryptString(plaintext);
  }

  decrypt(ciphertext: Buffer): string {
    if (!this.isAvailable()) {
      throw new SecretStorageUnavailableError();
    }
    return safeStorage.decryptString(ciphertext);
  }
}
