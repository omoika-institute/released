import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    // Externalize native modules as they cannot be bundled by Vite/Rollup
    rollupOptions: {
      external: [
        "@tursodatabase/database",
        "@tursodatabase/database-common",
        "@tursodatabase/database-linux-x64-gnu",
        "@tursodatabase/database-linux-arm64-gnu",
        "@tursodatabase/database-darwin-arm64",
        "@tursodatabase/database-win32-x64-msvc",
        "@lmstudio/sdk",
        "@lmstudio/lms-isomorphic",
        "ws",
      ],
    },
  },
  resolve: {
    alias: [
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
    ],
  },
});
