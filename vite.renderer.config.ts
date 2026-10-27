import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import preact from "@preact/preset-vite";

function parseSvgAttributes(source: string) {
  const attributes: Record<string, string> = {};
  const attributePattern =
    /([^\s=]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of source.matchAll(attributePattern)) {
    const [, key, , doubleQuoted, singleQuoted, unquoted] = match;

    attributes[key] = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
  }

  return attributes;
}

function svgReactComponentPlugin(): Plugin {
  return {
    name: "svg-react-component",
    enforce: "pre",
    load(id) {
      const [filepath, queryString = ""] = id.split("?", 2);

      if (!filepath.endsWith(".svg")) {
        return null;
      }

      const query = new URLSearchParams(queryString);

      if (!query.has("react")) {
        return null;
      }

      const source = readFileSync(filepath, "utf8").trim();
      const match = source.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>$/i);

      if (!match) {
        throw new Error(`Unable to parse SVG component: ${filepath}`);
      }

      const [, attributesSource, innerMarkup] = match;
      const rootAttributes = parseSvgAttributes(attributesSource);

      return `
import { h } from "preact";

const rootAttributes = ${JSON.stringify(rootAttributes)};
const innerMarkup = ${JSON.stringify(innerMarkup)};

export default function SvgComponent(props) {
  const svgProps = { ...props };
  delete svgProps.children;

  return h("svg", {
    ...rootAttributes,
    ...svgProps,
    dangerouslySetInnerHTML: { __html: innerMarkup },
  });
}
`;
    },
  };
}

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    svgReactComponentPlugin(),
    preact({ devToolsEnabled: false }),
    tailwindcss(),
  ],
  resolve: {
    alias: [
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
      {
        find: "react",
        replacement: "preact/compat/",
      },
      {
        find: "react-dom",
        replacement: "preact/compat/",
      },
    ],
  },
});
