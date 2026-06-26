import type { IpcApi } from '@shared/ipc/contract';

declare global {
  interface Window {
    api: IpcApi;
  }
}

export const api: IpcApi = window.api;
