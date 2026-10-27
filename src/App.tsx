import { render } from "preact";
import { lazy, Suspense } from "preact/compat";
import { createHashRouter, RouterProvider } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { getIconSpriteMarkup } from "./components/sprite";
import "./i18n";

import PublicLayout from "./layouts/PublicLayout";
import Databases from "./renderer/Databases";
import { AppLoading } from "./components/loaders";
import { WorkspaceSkeleton } from "./renderer/workspace/_skeletons";
import { DashboardSkeleton } from "./renderer/dashboard/_skeletons";

const AppLayout = lazy(() => import("./layouts/AppLayout"));
const GraphLayout = lazy(() => import("./layouts/GraphLayout"));
const WorkspaceLayout = lazy(() => import("./layouts/WorkspaceLayout"));
const NotFound = lazy(() => import("./renderer/NotFound"));
const Dashboard = lazy(() => import("./renderer/dashboard"));
const Agents = lazy(() => import("./renderer/agents"));
const Browser = lazy(() => import("./renderer/browser"));
const Marketplace = lazy(() => import("./renderer/marketplace"));
const MarketplaceRepo = lazy(() => import("./renderer/marketplace/Repo"));
const GraphDetails = lazy(() => import("./renderer/dashboard/Details"));
const Overview = lazy(() => import("./renderer/overview"));
const Settings = lazy(() => import("./renderer/settings"));
const Workspaces = lazy(() => import("./renderer/workspace"));
const CreateDatabases = lazy(() => import("./renderer/CreateDatabase"));

const router = createHashRouter([
  {
    path: "/",
    element: (
      <ErrorBoundary>
        <PublicLayout />
      </ErrorBoundary>
    ),
    children: [
      {
        path: "",
        element: <Databases />,
      },
      {
        path: "/create",
        element: (
          <Suspense fallback={<AppLoading />}>
            <CreateDatabases />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: "/*",
    element: (
      <ErrorBoundary>
        <WorkspaceLayout />
      </ErrorBoundary>
    ),
    children: [
      {
        element: (
          <ErrorBoundary>
            <AppLayout />
          </ErrorBoundary>
        ),
        children: [
          {
            path: "dashboard",
            element: (
              <Suspense fallback={<DashboardSkeleton />}>
                <Dashboard />
              </Suspense>
            ),
            children: [
              {
                path: "case/:hid/agents",
                element: (
                  <Suspense fallback={<AppLoading />}>
                    <Agents />
                  </Suspense>
                ),
              },
              {
                path: "case/:hid",
                element: (
                  <Suspense fallback={<AppLoading />}>
                    <GraphDetails />
                  </Suspense>
                ),
              },
            ],
          },
          {
            path: "browser/:tabId",
            element: (
              <Suspense fallback={<AppLoading />}>
                <Browser />
              </Suspense>
            ),
          },
          {
            path: "agents",
            element: (
              <Suspense fallback={<AppLoading />}>
                <Agents />
              </Suspense>
            ),
          },
          {
            path: "overview",
            element: (
              <Suspense fallback={<AppLoading />}>
                <Overview />
              </Suspense>
            ),
          },
          {
            path: "overview/:tabId",
            element: (
              <Suspense fallback={<AppLoading />}>
                <Overview />
              </Suspense>
            ),
          },
          {
            path: "overview/:tabId/case/:caseId",
            element: (
              <Suspense fallback={<AppLoading />}>
                <Overview />
              </Suspense>
            ),
          },
          {
            path: "settings",
            element: (
              <Suspense fallback={<AppLoading />}>
                <Settings />
              </Suspense>
            ),
          },
          {
            path: "workspaces",
            element: (
              <Suspense fallback={<WorkspaceSkeleton />}>
                <Workspaces />
              </Suspense>
            ),
          },
          {
            path: "marketplace",
            element: (
              <Suspense fallback={<AppLoading />}>
                <Marketplace />
              </Suspense>
            ),
            children: [
              {
                path: ":repoId",
                element: (
                  <Suspense fallback={<AppLoading />}>
                    <MarketplaceRepo />
                  </Suspense>
                ),
              },
            ],
          },
        ],
      },
      {
        path: "flow",
        element: (
          <ErrorBoundary>
            <GraphLayout />
          </ErrorBoundary>
        ),
        children: [
          {
            path: ":hid",
            element: null,
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: (
      <Suspense fallback={<AppLoading />}>
        <NotFound />
      </Suspense>
    ),
  },
]);

export default function App() {
  return (
    <>
      <div
        id="omoika-icon-sprite"
        aria-hidden="true"
        style={{ display: "none" }}
        dangerouslySetInnerHTML={{ __html: getIconSpriteMarkup() }}
      />
      <RouterProvider router={router} />
    </>
  );
}

render(<App />, document.getElementById("omoika") as HTMLElement);
