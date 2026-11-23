/**
 * The cipher boundary keeps secret storage testable and keeps Electron's
 * safeStorage import out of services that unit tests load directly.
 */
export interface SecretCipher {
  readonly backend: string;
  isAvailable(): boolean;
  encrypt(plaintext: string): Buffer;
  decrypt(ciphertext: Buffer): string;
}

export class SecretStorageUnavailableError extends Error {
  readonly code = 'SECRET_STORAGE_UNAVAILABLE';

  constructor() {
    super(
      'Secure credential storage is unavailable on this system. No credential was saved and no insecure fallback was used.',
    );
    this.name = 'SecretStorageUnavailableError';
  }
}

export class SecretStoreCorruptError extends Error {
  readonly code = 'SECRET_STORE_CORRUPT';

  constructor() {
    super('The encrypted credential store could not be read. It was left unmodified.');
    this.name = 'SecretStoreCorruptError';
  }
}

export class SecretEncryptionError extends Error {
  readonly code = 'SECRET_ENCRYPTION_FAILED';

  constructor() {
    super('The credential could not be encrypted. Nothing was saved.');
    this.name = 'SecretEncryptionError';
  }
}

export class SecretDecryptionError extends Error {
  readonly code = 'SECRET_DECRYPTION_FAILED';

  constructor() {
    super('The stored credential could not be decrypted.');
    this.name = 'SecretDecryptionError';
  }
}

export class SecretNotFoundError extends Error {
  readonly code = 'SECRET_NOT_FOUND';

  constructor() {
    super('No credential is stored for this reference.');
    this.name = 'SecretNotFoundError';
  }
}

export class SecretValidationError extends Error {
  readonly code = 'SECRET_VALIDATION_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'SecretValidationError';
  }
}
