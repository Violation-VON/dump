import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

const base = `${(process.env.BASE_PATH ?? "").replace(/\/+$/, "")}/`;

const pages = (): Plugin => ({
  name: "pages",
  transformIndexHtml: () => [
    { tag: "base", attrs: { href: base }, injectTo: "head-prepend" },
  ],
});

export default defineConfig({
  root: "src",
  cacheDir: "../node_modules/.vite",
  base,
  plugins: [tailwindcss(), pages()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
});
