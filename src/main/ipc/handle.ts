import { ipcMain, IpcMainInvokeEvent } from "electron";

export function bindHandle<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: TArgs
  ) => Promise<TResult> | TResult
) {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, handler);
}
