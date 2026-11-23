export class IpcValidationError extends Error {
  readonly code = 'IPC_VALIDATION_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'IpcValidationError';
  }
}

export function assertArgumentCount(args: readonly unknown[], expected: number): void {
  if (args.length !== expected) {
    throw new IpcValidationError('Unexpected IPC arguments');
  }
}

export function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new IpcValidationError(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function assertKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new IpcValidationError(`${field} contains an unsupported field.`);
    }
  }
}

export function asString(
  value: unknown,
  field: string,
  options: { min?: number; max?: number; pattern?: RegExp } = {},
): string {
  const { min = 0, max = Number.MAX_SAFE_INTEGER, pattern } = options;

  if (typeof value !== 'string') {
    throw new IpcValidationError(`${field} must be a string.`);
  }
  if (value.length < min || value.length > max) {
    throw new IpcValidationError(`${field} has an invalid length.`);
  }
  if (pattern && !pattern.test(value)) {
    throw new IpcValidationError(`${field} has an invalid format.`);
  }

  return value;
}

export function asOptionalString(
  value: unknown,
  field: string,
  options: { min?: number; max?: number; pattern?: RegExp } = {},
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return asString(value, field, options);
}

export function asBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new IpcValidationError(`${field} must be a boolean.`);
  }
  return value;
}

export function asNumber(
  value: unknown,
  field: string,
  options: { min?: number; max?: number } = {},
): number {
  const { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = options;

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new IpcValidationError(`${field} must be a finite number.`);
  }
  if (value < min || value > max) {
    throw new IpcValidationError(`${field} is out of range.`);
  }

  return value;
}

export function asInteger(
  value: unknown,
  field: string,
  options: { min?: number; max?: number } = {},
): number {
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = options;

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new IpcValidationError(`${field} must be an integer.`);
  }
  if (value < min || value > max) {
    throw new IpcValidationError(`${field} is out of range.`);
  }

  return value;
}

export function asStringArray(
  value: unknown,
  field: string,
  options: { minItems?: number; maxItems?: number; maxLength?: number } = {},
): string[] {
  const { minItems = 0, maxItems = Number.MAX_SAFE_INTEGER, maxLength = 500 } = options;

  if (!Array.isArray(value)) {
    throw new IpcValidationError(`${field} must be an array.`);
  }
  if (value.length < minItems || value.length > maxItems) {
    throw new IpcValidationError(`${field} has an invalid number of items.`);
  }
  for (const item of value) {
    if (typeof item !== 'string' || item.length > maxLength) {
      throw new IpcValidationError(`${field} contains an invalid item.`);
    }
  }

  return value as string[];
}

export function asEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new IpcValidationError(`${field} is not a supported value.`);
  }
  return value as T;
}

export function toPublicErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
