import { type ForgeConfig } from "@electron-forge/shared-types";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerRpm } from "@electron-forge/maker-rpm";
import MakerAppImage from "electron-forge-maker-appimage";
import MakerSquirrel from "@electron-forge/maker-squirrel"
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { ElectronegativityPlugin } from "@electron-forge/plugin-electronegativity";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { MakerMSIX } from "@electron-forge/maker-msix";
import fsp from "node:fs/promises";
import path from "node:path";
import { Walker, DepType } from "flora-colossus";
import type { Module } from "flora-colossus";
import { buildBundledPythonRuntime } from "./build-python-runtime";
// import { MakerPKG } from "@electron-forge/maker-pkg";

type CopyClass<T> = {
  [P in keyof T]: T[P];
};

type CustomWalker = CopyClass<Walker> & {
  modules: Module[];
  walkDependenciesForModule: (
    moduleRoot: string,
    depType: DepType,
  ) => Promise<void>;
};

const externalDependencies = ["@tursodatabase/database", "@lmstudio/sdk"];
const bundledPythonRuntimePath = path.resolve(
  __dirname,
  "framework",
  "dist",
  "omoika-runtime",
);

const config: ForgeConfig = {
  publishers: [],
  packagerConfig: {
    name: "OMOIKA",
    asar: true,
    prune: true,
    extraResource: [bundledPythonRuntimePath],
    executableName: "omoika",
    appCopyright: "jerlendds <omoika-institute@proton.me>",
    icon: "./src/assets/images/icon",
  },
  rebuildConfig: {},
  hooks: {
    async preStart() {
      await buildBundledPythonRuntime();
    },
    async prePackage() {
      await buildBundledPythonRuntime();
    },
    async packageAfterCopy(_forgeConfig, buildPath) {
      const depsToCopy = new Set<string>(externalDependencies);

      const sourceNodeModulesPath = path.resolve(__dirname, "node_modules");
      const destNodeModulesPath = path.resolve(buildPath, "node_modules");

      for (const dep of externalDependencies) {
        const walker = new Walker(
          path.join(sourceNodeModulesPath, dep),
        ) as unknown as CustomWalker;

        await walker.walkDependenciesForModule(
          path.join(sourceNodeModulesPath, dep),
          DepType.PROD,
        );

        walker.modules.forEach((treeDep) => {
          depsToCopy.add(treeDep.name);
        });
      }

      await Promise.all(
        Array.from(depsToCopy.values()).map(async (packageName) => {
          const sourcePath = path.join(sourceNodeModulesPath, packageName);
          const destPath = path.join(destNodeModulesPath, packageName);

          await fsp.mkdir(path.dirname(destPath), { recursive: true });
          await fsp.cp(sourcePath, destPath, {
            recursive: true,
            preserveTimestamps: true,
          });
        }),
      );
    },
  },
  makers: [
    new MakerZIP({}, ["darwin", "linux", "win32"]),
    // new MakerRpm(
    //   {
    //     options: {
    //       homepage: "https://osintbuddy.com",
    //       icon: "./src/assets/images/icon.png",
    //     },
    //   },
    //   ["linux"]
    // ),
    new MakerDMG(
      {
        title: "OMOIKA",
        icon: "./src/assets/images/icon.png",
        background: "./src/assets/images/dmg-background.png",
        format: "ULFO",
      },
      ["darwin"],
    ),
    // TODO: fix later by adding identity/cert somehow
    // error:`Making a pkg distributable for darwin/arm64 [FAILED: No identity found for signing.]`
    // new MakerPKG(
    // {
    // identityValidation: false,
    // },
    // ["darwin"]
    // ),
    // new MakerDeb({
    //   options: {
    //     homepage: "https://osintbuddy.com",
    //     icon: "./src/assets/images/icon.png",
    //     bin: "osintbuddy",
    //   },
    // }),
    // Requires expensive code signing #fuck-microsoft:
    // new MakerMSIX({
    //   manifestVariables: {
    //     publisher: "CN=OMOIKA",
    //     packageIdentity: "com.institute.omoika",
    //     appExecutable: "omoika.exe",
    //     appDisplayName: "OMOIKA",
    //     packageVersion: "0.2.0.0",
    //     targetArch: "x64",
    //   },
    //   windowsSignOptions: {
    //     certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
    //     certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
    //     website: "https://omoika.institute",
    //     description:
    //       "Entity graphs, OSINT data mining, and plugins. Connect unstructured and public data for transformative insights",
    //   },
    // }),
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
        certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
      },
    },
    new MakerAppImage(
      {
        options: {
          homepage: "https://omoika.institute",
          description: "Entity graphs, OSINT data mining, and plugins.",
          icon: "./src/assets/images/icon.png",
          maintainer: "jerlendds <omoika-institute@proton.me>",
          name: "omoika",
          productDescription:
            "Entity graphs, OSINT data mining, and plugins. Connect unstructured and public data for transformative insights",
          productName: "OMOIKA",
        },
      },
      ["linux"],
    ),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds; Main process, Preload scripts, Worker process, etc.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
    new ElectronegativityPlugin({
      isSarif: true,
    }),
  ],
};

export default config;
