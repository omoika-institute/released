import { MouseEventHandler } from "preact";
import { Outlet } from "react-router-dom";
import ToastViewport from "@/components/toasts/ToastViewport";

interface HamburgerProps {
  isOpen: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  className?: string;
}

export function HamburgerMenu({ isOpen, onClick, className }: HamburgerProps) {
  return (
    <button
      onClick={onClick}
      class={`hamburger ${className ?? ""} ${isOpen && "is-active"}`}
    >
      <span className="line" />
      <span className="line" />
      <span className="line" />
    </button>
  );
}

interface SidebarProps {
  showSidebar: boolean;
  toggleSidebar: () => void;
}

const navigation = [
  { to: "/dashboard", icon: "home-infinity" },
  { to: "/marketplace", icon: "shopping-bag" },
];

export default function AppLayout() {
  return (
    <>
      <main id="main" className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
      <ToastViewport />
    </>
  );
}
