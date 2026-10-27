import { ipcMain } from "electron";
import {
  checkP2PServerUrl,
  getP2PIceServers,
  getP2PRoomPeers,
  getP2PServerStatus,
  startP2PServer,
  stopP2PServer,
  type P2PServerStartPayload,
} from "../app/p2pServer";
import type { IpcContext } from "./types";

export function registerP2PIpc(_deps: IpcContext) {
  ipcMain.handle("p2p:server-status", () => getP2PServerStatus());
  ipcMain.handle("p2p:check-url", (_event, payload: { signalingUrl: string }) =>
    checkP2PServerUrl(payload.signalingUrl),
  );
  ipcMain.handle(
    "p2p:ice-servers",
    (_event, payload: { signalingUrl: string }) =>
      getP2PIceServers(payload.signalingUrl),
  );
  ipcMain.handle(
    "p2p:room-peers",
    (_event, payload: { signalingUrl: string; graphId: string }) =>
      getP2PRoomPeers(payload.signalingUrl, payload.graphId),
  );
  ipcMain.handle(
    "p2p:start-server",
    (_event, payload?: P2PServerStartPayload) => startP2PServer(payload ?? {}),
  );
  ipcMain.handle("p2p:stop-server", () => stopP2PServer());
}
