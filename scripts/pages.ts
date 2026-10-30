import { dirname, join } from "node:path";
import Mustache from "mustache";
import { type Page, Renderer } from "../src/render.ts";
import { classUrl, pkgUrl } from "../src/shared.ts";
import type { Members, Meta } from "../src/types.ts";

const DATA = "src/data";
const OUT = "dist";
const NAME = "Evrima Object Dump";

const template = await Deno.readTextFile(`${OUT}/index.html`);
if (!template.includes("{{{main}}}")) {
  throw new Error(
    `${OUT}/index.html is not the template. Run deno task bundle.`,
  );
}

const sha = Deno.env.get("GITHUB_SHA") ?? "";
const repo = Deno.env.get("GITHUB_REPOSITORY") ?? "";
const stamp = {
  version: await Deno.readTextFile("VERSION").then((v) => v.trim()).catch(() =>
    ""
  ),
  commit: !!(repo && sha),
  repo,
  sha,
  short: sha.slice(0, 7),
};

const meta: Meta = JSON.parse(await Deno.readTextFile(`${DATA}/meta.json`));
const members = new Map<number, Members>();
for (let n = 0; n < meta.shards; n++) {
  const shard: Record<number, Members> = JSON.parse(
    await Deno.readTextFile(`${DATA}/m/${n}.json`),
  );
  for (const [i, m] of Object.entries(shard)) members.set(Number(i), m);
}

const site = new Renderer(meta, members, NAME);

function* pages(): Generator<[string, Page]> {
  yield ["index.html", site.home()];
  yield ["404.html", site.notFound()];
  for (let i = 0; i < site.packages.length; i++) {
    yield [`${decodeURIComponent(pkgUrl(site.packages[i]))}.html`, site.pkg(i)];
  }
  for (const c of site.classes) {
    yield [`${decodeURIComponent(classUrl(c.path))}.html`, site.cls(c)];
  }
}

async function write(path: string, text: string) {
  const file = join(OUT, path);
  await Deno.mkdir(dirname(file), { recursive: true });
  await Deno.writeTextFile(file, text);
}

let count = 0;
let chars = 0;
let batch: Promise<void>[] = [];
for (const [path, page] of pages()) {
  const html = Mustache.render(template, {
    ...stamp,
    title: page.title ? `${page.title} · ${NAME}` : NAME,
    main: page.main,
  });
  count++;
  chars += html.length;
  batch.push(write(path, html));
  if (batch.length === 64) {
    await Promise.all(batch);
    batch = [];
  }
}
await Promise.all(batch);

console.log(
  `${count.toLocaleString()} pages, ${(chars / 1e6).toFixed(1)} MB of HTML`,
);
