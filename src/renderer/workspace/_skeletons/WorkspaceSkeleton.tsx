import WorkspaceAppbarSkeleton from "./WorkspaceAppbarSkeleton";
import EntityElementsPaletteSkeleton from "./EntityElementsPaletteSkeleton";
import LayoutCanvasSkeleton from "./LayoutCanvasSkeleton";
import PropertiesPanelSkeleton from "./PropertiesPanelSkeleton";

export default function WorkspaceSkeleton() {
  return (
    <div className="flex h-full max-h-screen w-full">
      <div className="flex h-full min-h-0 w-full flex-col gap-y-3 p-3">
        <WorkspaceAppbarSkeleton />

        <div className="flex w-full grow gap-3 h-full">
          <EntityElementsPaletteSkeleton />

          <div className="flex w-full">
            <div className="flex flex-1 flex-col">
              <LayoutCanvasSkeleton />
            </div>
            <PropertiesPanelSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
