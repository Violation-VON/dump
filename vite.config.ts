import tailwindcss from "@tailwindcss/vite";
import { minify } from "html-minifier-terser";
import { defineConfig, type Plugin } from "vite";

const base = `${(process.env.BASE_PATH ?? "").replace(/\/+$/, "")}/`;

const pages = (): Plugin => ({
  name: "pages",
  transformIndexHtml: () => [
    { tag: "base", attrs: { href: base }, injectTo: "head-prepend" },
  ],
});

const minifyHtml = (): Plugin => ({
  name: "minify-html",
  enforce: "post",
  async generateBundle(_, bundle) {
    const page = bundle["index.html"];
    if (page?.type !== "asset") return;
    page.source = await minify(String(page.source), {
      collapseWhitespace: true,
      removeComments: true,
      useShortDoctype: true,
      ignoreCustomFragments: [/\{\{[^}]*\}\}\}?/],
    });
  },
});

export default defineConfig({
  root: "src",
  cacheDir: "../node_modules/.vite",
  base,
  plugins: [tailwindcss(), pages(), minifyHtml()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
});
