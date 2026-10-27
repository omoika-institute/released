/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

declare module "*.css";
declare module "*?raw" {
  const content: string;
  export default content;
}

declare module "*.wasm?url" {
  const url: string;
  export default url;
}

declare module "*.svg" {
  const source: string;
  export default source;
}

declare module "*.svg?react" {
  import type { FunctionComponent, JSX } from "preact";

  const SvgComponent: FunctionComponent<JSX.SVGAttributes<SVGSVGElement>>;
  export default SvgComponent;
}

declare module "*.svg?raw" {
  const content: string;
  export default content;
}
