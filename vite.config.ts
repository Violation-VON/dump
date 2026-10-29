import { copyFileSync } from "node:fs";
import { join } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

const base = `${(process.env.BASE_PATH ?? "").replace(/\/+$/, "")}/`;

function readVersion(): string {
  try {
    return Deno.readTextFileSync("VERSION").trim();
  } catch {
    return "";
  }
}

const pages = (): Plugin => ({
  name: "pages",
  transformIndexHtml: () => [
    { tag: "base", attrs: { href: base }, injectTo: "head-prepend" },
  ],
  writeBundle({ dir }) {
    if (dir) copyFileSync(join(dir, "index.html"), join(dir, "404.html"));
  },
});

export default defineConfig({
  root: "src",
  cacheDir: "../node_modules/.vite",
  base,
  plugins: [tailwindcss(), pages()],
  define: {
    __BUILD__: JSON.stringify({
      version: readVersion(),
      commit: process.env.GITHUB_SHA ?? "",
      repo: process.env.GITHUB_REPOSITORY ?? "",
    }),
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
});
