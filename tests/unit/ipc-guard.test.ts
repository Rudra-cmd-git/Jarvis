import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isTrustedRendererUrl } from '../../src/main/utils/ipc-guard';

const trustedFile = path.resolve('dist-renderer', 'index.html');

describe('IPC renderer trust', () => {
  it('accepts the development origin and its pages', () => {
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/', trustedFile, true)).toBe(true);
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/src/renderer/index.html', trustedFile, true)).toBe(true);
  });

  it('rejects spoofed and unrelated development URLs', () => {
    expect(isTrustedRendererUrl('http://127.0.0.1:5173.evil.test/', trustedFile, true)).toBe(false);
    expect(isTrustedRendererUrl('https://127.0.0.1:5173/', trustedFile, true)).toBe(false);
    expect(isTrustedRendererUrl('http://localhost:5173/', trustedFile, true)).toBe(false);
    expect(isTrustedRendererUrl('file:///C:/app/dist-renderer/index.html', trustedFile, true)).toBe(false);
  });

  it('accepts only the exact production renderer file', () => {
    const trustedUrl = pathToFileURL(trustedFile).toString();
    expect(isTrustedRendererUrl(trustedUrl, trustedFile, false)).toBe(true);
  });

  it('rejects other files and origins in production', () => {
    const sibling = path.resolve('dist-renderer', 'evil.html');
    expect(isTrustedRendererUrl(sibling, trustedFile, false)).toBe(false);
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/', trustedFile, false)).toBe(false);
    expect(isTrustedRendererUrl('', trustedFile, false)).toBe(false);
    expect(isTrustedRendererUrl('not a url', trustedFile, false)).toBe(false);
  });
});
