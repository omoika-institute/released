import { Outlet } from "react-router-dom";
import ToastViewport from "@/components/toasts/ToastViewport";

export default function GraphLayout() {
  return (
    <>
      <Outlet />
      <ToastViewport />
    </>
  );
}
