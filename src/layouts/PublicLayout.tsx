import type { JSX } from "preact/jsx-runtime";
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  Outlet,
} from "react-router-dom";
import { useEffect, useState } from "preact/hooks";
import { Icon } from "@/components/icons";
import Logo from "@/assets/images/wordmark.svg?react";
import ToastViewport from "@/components/toasts/ToastViewport";
import WorldMapBackground from "@/components/WorldMapBackground";
import LanguageSwitcher from "@/components/LanguageSwitcher";

function PublicNavbar(): JSX.Element {
  return (
    <>
      <header
        class={`absolute top-0 z-50 flex w-full justify-center px-10 shadow-md py-5`}
      >
        <div class="pointer-events-none relative flex w-full items-center justify-center">
          <Logo class="h-6 select-none fill-ink/90 lg:block " />
        </div>
      </header>
      <div className="right-4 cursor-pointer absolute top-4 z-50">
        <LanguageSwitcher />
      </div>
    </>
  );
}

export default function PublicLayout(): React.ReactElement {
  return (
    <>
      <PublicNavbar />
      <WorldMapBackground>
        <Outlet />
      </WorldMapBackground>
      <ToastViewport />
    </>
  );
}
