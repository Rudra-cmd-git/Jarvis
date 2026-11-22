import type { JarvisApi } from './types';

declare global {
  interface Window {
    jarvis: JarvisApi;
  }
}

export {};
