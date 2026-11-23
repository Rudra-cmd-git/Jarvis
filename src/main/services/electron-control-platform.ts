import fs from 'node:fs/promises';
import path from 'node:path';
import { BrowserWindow, clipboard, desktopCapturer, shell } from 'electron';
import type { ControlWindowAction } from '../../shared/control';
import type { CapturedScreenshot, ControlPlatform } from './control-platform';

export class ElectronControlPlatform implements ControlPlatform {
  now(): number {
    return Date.now();
  }

  async clipboardText(): Promise<string> {
    return clipboard.readText();
  }

  async openPath(targetPath: string): Promise<string | null> {
    const error = await shell.openPath(targetPath);
    return error || null;
  }

  async captureScreenshot(directory: string): Promise<CapturedScreenshot> {
    await fs.mkdir(directory, { recursive: true });
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 },
    });
    const source = sources[0];
    if (!source) {
      throw new Error('No screen source is available.');
    }

    const capturedAt = Date.now();
    const png = source.thumbnail.toPNG();
    if (png.length === 0) {
      throw new Error('The screenshot was empty.');
    }

    const filePath = path.join(directory, `screenshot-${capturedAt}.png`);
    await fs.writeFile(filePath, png);
    return { filePath, bytes: png.length, capturedAt };
  }

  windowAction(senderId: number, action: ControlWindowAction['action']): boolean {
    const window = BrowserWindow.getAllWindows().find(
      (candidate) => candidate.webContents.id === senderId,
    );
    if (!window || window.isDestroyed()) {
      return false;
    }

    switch (action) {
      case 'minimize':
        window.minimize();
        break;
      case 'maximize':
        if (window.isMaximized()) {
          window.unmaximize();
        } else {
          window.maximize();
        }
        break;
      case 'restore':
        window.restore();
        break;
      case 'focus':
        window.focus();
        break;
      default:
        return false;
    }
    return true;
  }
}
