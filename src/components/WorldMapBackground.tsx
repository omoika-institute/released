import type { ComponentChildren } from "preact";

import DottedWorldMap from "@/assets/images/dotted-world-map.svg?react";
import { Grid } from "./Geometry";

interface GridBackgroundProps {
  children?: ComponentChildren;
}

export default function WorldMapBackground({ children }: GridBackgroundProps) {
  return (
    <div
      className={`flex min-h-screen bg-canvas items-center justify-center overflow-hidden `}
    >
      <Grid />
      <DottedWorldMap className="absolute inset-0 h-full w-full fill-ink/25" />
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_25%,#090909_80%)]" />
      <div className="relative flex w-full items-center justify-center ">
        {children}
      </div>
    </div>
  );
}
