import path from "node:path";
import fs from "node:fs";
import { URL, pathToFileURL } from "node:url";
import started from "electron-squirrel-startup";
import {
  app,
  BrowserWindow,
  globalShortcut,
  nativeTheme,
  protocol,
} from "electron";

import workspace from "./main/app/workspace";
import db from "./main/app/db";
import userTools from "./main/app/userTools";
import {
  isAllowedBrowserGuestNavigation,
  isAllowedBrowserPartition,
  isSafeBrowserUrl,
} from "./main/browser";
import { registerIpcHandlers } from "./main/ipc";

// Protocol setup 1.
const OMOIKA_PROTOCOL = "omoika";
const DEVTOOLS_ACCELERATOR = "CommandOrControl+Shift+I";
const isDevMode = Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL);
let mainLogPath: string | null = null;

function getMainLogPath() {
  if (mainLogPath) return mainLogPath;

  try {
    const logDir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    mainLogPath = path.join(logDir, "main.log");
  } catch {
    mainLogPath = path.join(process.cwd(), "omoika-main.log");
  }

  return mainLogPath;
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return error;
}

function logMain(message: string, metadata?: unknown) {
  const timestamp = new Date().toISOString();
  const suffix =
    metadata === undefined
      ? ""
      : ` ${JSON.stringify(metadata, (_key, value) =>
          value instanceof Error ? describeError(value) : value
        )}`;
  const line = `[${timestamp}] ${message}${suffix}\n`;

  try {
    fs.appendFileSync(getMainLogPath(), line, "utf-8");
  } catch {
    // Logging must never take down the app.
  }

  console.log(line.trimEnd());
}

function requestDarkColorScheme(contents: Electron.WebContents) {
  if (contents.getType() !== "webview") return;

  const applyDarkScheme = async () => {
    if (contents.isDestroyed()) return;

    try {
      if (!contents.debugger.isAttached()) {
        contents.debugger.attach("1.3");
      }

      await contents.debugger.sendCommand("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: "dark" }],
      });
    } catch (error) {
      logMain("browser:webview-dark-mode-failed", describeError(error));
    }
  };
  const applyDarkSchemeSoon = () => {
    void applyDarkScheme();
  };

  applyDarkSchemeSoon();
  contents.on("dom-ready", applyDarkSchemeSoon);
  contents.on("did-start-navigation", applyDarkSchemeSoon);
  contents.on("did-finish-load", applyDarkSchemeSoon);
  contents.once("destroyed", () => {
    contents.removeListener("dom-ready", applyDarkSchemeSoon);
    contents.removeListener("did-start-navigation", applyDarkSchemeSoon);
    contents.removeListener("did-finish-load", applyDarkSchemeSoon);
  });
}

process.on("uncaughtException", (error) => {
  logMain("process:uncaughtException", describeError(error));
});

process.on("unhandledRejection", (reason) => {
  logMain("process:unhandledRejection", describeError(reason));
});

protocol.registerSchemesAsPrivileged([
  {
    scheme: OMOIKA_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

// Prefer classic scrollbars so hover/active styles can apply - ignored on macOS
app.commandLine.appendSwitch("disable-features", "OverlayScrollbar");
nativeTheme.themeSource = "dark";

// Security - https://www.electronjs.org/docs/latest/tutorial/security
app.on("web-contents-created", (_event, contents) => {
  requestDarkColorScheme(contents);

  contents.setWindowOpenHandler(({ url }) => {
    if (contents.getType() === "webview" && isSafeBrowserUrl(url)) {
      void contents.loadURL(url);
    }

    return { action: "deny" };
  });

  contents.on("will-attach-webview", (event, webPreferences, params) => {
    if (!isAllowedBrowserPartition(params.partition)) {
      event.preventDefault();
      return;
    }

    if (typeof params.src === "string" && !isSafeBrowserUrl(params.src)) {
      event.preventDefault();
      return;
    }

    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    webPreferences.experimentalFeatures = false;
    params.allowpopups = "false";
  });
  contents.on("did-attach-webview", (_event, webContents) => {
    requestDarkColorScheme(webContents);
  });

  contents.on("will-navigate", (event, navigationUrl) => {
    if (contents.getType() !== "webview") return;
    if (isAllowedBrowserGuestNavigation(navigationUrl)) return;

    event.preventDefault();
  });

  // Use will-frame-navigate to distinguish between mainframe and iframe navigation
  contents.on("will-frame-navigate", (event) => {
    // Only lock down the *app window* renderer. Embedded browser content is hosted in separate WebContents and should be able to navigate.
    if (contents.getType() !== "window") return;

    const parsedUrl = new URL(event.url);

    // Allow iframe navigation (isMainFrame = false), block main frame navigation to external sites
    if (
      event.isMainFrame &&
      parsedUrl.origin !== "https://osintbuddy.com" &&
      !event.url.startsWith("http://localhost")
    ) {
      // Only prevent navigation for the main frame
      event.preventDefault();
    }
    // iframes are allowed to navigate anywhere (they're sandboxed anyway)
  });
});

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const registerDevToolsShortcut = () => {
  if (!isDevMode) return;
  const registered = globalShortcut.register(DEVTOOLS_ACCELERATOR, () => {
    const targetWindow =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!targetWindow || targetWindow.isDestroyed()) return;
    targetWindow.webContents.openDevTools();
  });

  if (!registered) {
    console.warn(
      `Failed to register DevTools shortcut: ${DEVTOOLS_ACCELERATOR}.`
    );
  }
};

async function createWindow() {
  logMain("createWindow:start", {
    appPath: app.getAppPath(),
    userData: app.getPath("userData"),
    isPackaged: app.isPackaged,
  });

  await db.ready(app);
  logMain("createWindow:db-ready");
  await workspace.ready(app);
  logMain("createWindow:workspace-ready");

  const window = new BrowserWindow({
    width: 800,
    height: 600,
    icon: "./assets/images/icon.png",
    backgroundColor: "#06080e",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });
  logMain("createWindow:browser-window-created", {
    id: window.id,
    preload: path.join(__dirname, "preload.js"),
  });

  window.on("close", () => {
    logMain("window:close", { id: window.id });
  });
  window.on("closed", () => {
    logMain("window:closed", { id: window.id });
  });
  window.on("unresponsive", () => {
    logMain("window:unresponsive", { id: window.id });
  });
  window.webContents.on("did-finish-load", () => {
    logMain("webContents:did-finish-load", {
      id: window.id,
      url: window.webContents.getURL(),
    });
  });
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      logMain("webContents:did-fail-load", {
        id: window.id,
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame,
      });
    }
  );
  window.webContents.on("render-process-gone", (_event, details) => {
    logMain("webContents:render-process-gone", {
      id: window.id,
      details,
    });
  });
  window.webContents.on("preload-error", (_event, preloadPath, error) => {
    logMain("webContents:preload-error", {
      id: window.id,
      preloadPath,
      error: describeError(error),
    });
  });

  window.setMenu(null);
  // and finally load app index.html.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    logMain("window:loadURL:dev", { url: MAIN_WINDOW_VITE_DEV_SERVER_URL });
    window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    // PROD BUILDS: renderer files are in .vite/renderer/, but __dirname is .vite/build/
    const rendererPath = path.join(
      __dirname,
      "../renderer",
      MAIN_WINDOW_VITE_NAME,
      "index.html"
    );
    const rendererUrl = pathToFileURL(rendererPath).href;
    logMain("window:loadURL:prod", { rendererPath, rendererUrl });
    window.loadURL(rendererUrl);
  }

  // Application protocol setup 2.
  if (process.defaultApp) {
    // dev on macos/windows
    if (process.argv.length >= 2)
      app.setAsDefaultProtocolClient(OMOIKA_PROTOCOL, process.execPath, [
        process.argv[1],
      ]);
  } else {
    app.setAsDefaultProtocolClient(OMOIKA_PROTOCOL);
  }

  const sendDeeplinkToWindow = (url: string) => {
    if (!url.startsWith(`${OMOIKA_PROTOCOL}://`)) return;
    if (window.isMinimized()) window.restore();
    window.focus();
    window.webContents.send("deeplink", url);
  };

  // Multiple app processes are intentionally allowed so each launched Electron
  // client can join collaboration as a distinct WebRTC peer.
  app.on("open-url", (_, url) => sendDeeplinkToWindow(url));

  const deeplinkUrl = process.argv.find((a) =>
    a.startsWith(`${OMOIKA_PROTOCOL}://`)
  );
  if (deeplinkUrl) {
    window.webContents.once("did-finish-load", () =>
      sendDeeplinkToWindow(deeplinkUrl)
    );
  }
}

// Called after Electron initialization, some APIs can only be used after this event.
app.on("ready", () => {
  logMain("app:ready", {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  });
  registerDevToolsShortcut();
  createWindow().catch((error) => {
    logMain("createWindow:failed", describeError(error));
  });
});

app.on("will-quit", () => {
  logMain("app:will-quit");
  globalShortcut.unregisterAll();
});

app.on("child-process-gone", (_event, details) => {
  logMain("app:child-process-gone", details);
});

// Quit when all windows are closed (except on macOS). There, it's common
// for applications and their menu bar to stay active until the user quits  with Cmd + Q.
app.on("window-all-closed", () => {
  logMain("app:window-all-closed", { platform: process.platform });
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  logMain("app:activate", { windowCount: BrowserWindow.getAllWindows().length });
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and no other windows are open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

registerIpcHandlers({
  app,
  database: db,
  workspace,
  userTools,
  getMainWindow: () => BrowserWindow.getAllWindows()[0],
  getAllWindows: () => BrowserWindow.getAllWindows(),
});

// Validate the sender of all IPC messages
// https://electronjs.org/docs/latest/tutorial/security#17-validate-the-sender-of-all-ipc-messages -- e.g.
// ipcMain.handle('get-secrets', (e) => {
//   if (!validateSender(e.senderFrame)) return null
//   return getSecrets()
// })
// const ALLOW_LIST = [MAIN_WINDOW_VITE_DEV_SERVER_URL.replace("http://", "")];
// function validateSender(frame: WebFrameMain) {
//   if (ALLOW_LIST.includes(new URL(frame.url).host)) return true;
//   return false;
// }
