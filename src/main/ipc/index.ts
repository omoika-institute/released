import { registerAosintIpc } from "./aosint";
import { registerAgentsIpc } from "./agents";
import { registerBrowserIpc } from "./browser";
import { registerBuilderIpc } from "./builder";
import { registerCasesIpc } from "./cases";
import { registerDatabaseIpc } from "./database";
import { registerEntitiesIpc } from "./entities";
import { registerGraphIpc } from "./graph";
import { registerLicenseIpc } from "./license";
import { registerMetaIpc } from "./meta";
import { registerP2PIpc } from "./p2p";
import { registerPluginsIpc } from "./plugins";
import { registerSettingsIpc } from "./settings";
import { IpcContext } from "./types";
import { registerUserToolsIpc } from "./userTools";
import { registerWorkspaceIpc } from "./workspace";

export function registerIpcHandlers(deps: IpcContext) {
  registerAosintIpc(deps);
  registerAgentsIpc(deps);
  registerBrowserIpc(deps);
  registerBuilderIpc(deps);
  registerCasesIpc(deps);
  registerDatabaseIpc(deps);
  registerEntitiesIpc(deps);
  registerGraphIpc(deps);
  registerLicenseIpc(deps);

  registerMetaIpc(deps);
  registerP2PIpc(deps);
  registerPluginsIpc(deps);
  registerSettingsIpc(deps);
  registerUserToolsIpc(deps);
  registerWorkspaceIpc(deps);
}
