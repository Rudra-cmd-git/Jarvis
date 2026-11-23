import { describe, expect, it } from 'vitest';
import {
  asBoolean,
  asEnum,
  asInteger,
  asRecord,
  asString,
  asStringArray,
  assertArgumentCount,
  assertKeys,
  IpcValidationError,
} from '../../src/main/utils/validation';

describe('IPC validation helpers', () => {
  it('validates argument counts', () => {
    expect(() => assertArgumentCount([], 0)).not.toThrow();
    expect(() => assertArgumentCount([1], 1)).not.toThrow();
    expect(() => assertArgumentCount([1], 0)).toThrow(IpcValidationError);
    expect(() => assertArgumentCount([], 1)).toThrow(IpcValidationError);
  });

  it('rejects arrays and primitives where a record is required', () => {
    expect(() => asRecord([], 'payload')).toThrow(IpcValidationError);
    expect(() => asRecord('text', 'payload')).toThrow(IpcValidationError);
    expect(() => asRecord(null, 'payload')).toThrow(IpcValidationError);
    expect(asRecord({ a: 1 }, 'payload')).toEqual({ a: 1 });
  });

  it('rejects unknown fields', () => {
    expect(() => assertKeys({ a: 1 }, ['a'], 'payload')).not.toThrow();
    expect(() => assertKeys({ a: 1, b: 2 }, ['a'], 'payload')).toThrow(IpcValidationError);
  });

  it('validates strings, patterns, and lengths', () => {
    expect(asString('abc', 'value', { min: 1, max: 3 })).toBe('abc');
    expect(() => asString('', 'value', { min: 1 })).toThrow(IpcValidationError);
    expect(() => asString('abcd', 'value', { max: 3 })).toThrow(IpcValidationError);
    expect(() => asString('abc', 'value', { pattern: /^\d+$/ })).toThrow(IpcValidationError);
    expect(() => asString(1, 'value')).toThrow(IpcValidationError);
  });

  it('validates booleans, integers, enums, and string arrays', () => {
    expect(asBoolean(true, 'flag')).toBe(true);
    expect(() => asBoolean('true', 'flag')).toThrow(IpcValidationError);

    expect(asInteger(5, 'count', { min: 0, max: 10 })).toBe(5);
    expect(() => asInteger(1.5, 'count')).toThrow(IpcValidationError);
    expect(() => asInteger(11, 'count', { max: 10 })).toThrow(IpcValidationError);

    expect(asEnum('a', ['a', 'b'], 'choice')).toBe('a');
    expect(() => asEnum('c', ['a', 'b'], 'choice')).toThrow(IpcValidationError);

    expect(asStringArray(['a', 'b'], 'items', { minItems: 1 })).toEqual(['a', 'b']);
    expect(() => asStringArray([], 'items', { minItems: 1 })).toThrow(IpcValidationError);
    expect(() => asStringArray(['a', 2], 'items')).toThrow(IpcValidationError);
  });
});
