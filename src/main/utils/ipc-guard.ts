import { pathToFileURL } from 'node:url';
import path from 'node:path';
import type { IpcMainInvokeEvent } from 'electron';

export const DEV_RENDERER_ORIGIN = 'http://127.0.0.1:5173';

export function getRendererIndexPath(): string {
  return path.resolve(__dirname, '../../../dist-renderer/index.html');
}

export function isTrustedRendererUrl(
  candidate: string,
  rendererIndexPath: string,
  isDev: boolean,
): boolean {
  if (!candidate) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }

  if (isDev) {
    try {
      const origin = new URL(DEV_RENDERER_ORIGIN).origin;
      return parsed.origin === origin;
    } catch {
      return false;
    }
  }

  try {
    const trusted = new URL(pathToFileURL(rendererIndexPath).toString());
    return (
      parsed.protocol === trusted.protocol &&
      parsed.host === trusted.host &&
      decodeURIComponent(parsed.pathname) === decodeURIComponent(trusted.pathname)
    );
  } catch {
    return false;
  }
}

export function assertTrustedRenderer(event: IpcMainInvokeEvent): void {
  const candidate = event.senderFrame?.url ?? '';
  if (!isTrustedRendererUrl(candidate, getRendererIndexPath(), process.env.NODE_ENV === 'development')) {
    throw new Error('Blocked IPC request from untrusted renderer');
  }
}

export function assertNoArguments(args: readonly unknown[]): void {
  if (args.length > 0) {
    throw new Error('Unexpected IPC arguments');
  }
}
