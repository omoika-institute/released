import { Outlet } from "react-router-dom";
import AppTabs from "./AppTabs";
import PersistentBrowserTabs from "./PersistentBrowserTabs";
import PersistentFlowTabs from "./PersistentFlowTabs";

export default function WorkspaceLayout() {
  return (
    <>
      <AppTabs />
      <PersistentFlowTabs />
      <PersistentBrowserTabs />
      <Outlet />
    </>
  );
}
