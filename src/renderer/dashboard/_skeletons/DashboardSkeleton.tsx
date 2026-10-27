import DashboardSidebarSkeleton from "./DashboardSidebarSkeleton";
import DashboardContentSkeleton from "./DashboardContentSkeleton";

export default function DashboardSkeleton() {
  return (
    <div className="flex h-full px-3 py-3">
      <DashboardSidebarSkeleton />
      <DashboardContentSkeleton />
    </div>
  );
}
