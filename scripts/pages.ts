import { dirname, join } from "node:path";
import { xxhash128 } from "hash-wasm";
import Mustache from "mustache";
import { type Page, Renderer } from "../src/render.ts";
import { classUrl, esc, pkgUrl } from "../src/shared.ts";
import type { Members, Meta } from "../src/types.ts";

const DATA = "src/data";
const OUT = "dist";
const SITEMAP_LIMIT = 50_000;
const XML = '<?xml version="1.0" encoding="UTF-8"?>';
const NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const NAME = "Evrima Object Dump";

Mustache.escape = esc;

const template = await Deno.readTextFile(`${OUT}/index.html`);
if (!template.includes("{{{main}}}")) {
  throw new Error(
    `${OUT}/index.html is not the template. Run deno task bundle.`,
  );
}

const siteUrl = (Deno.env.get("SITE_URL") ?? "").replace(/\/+$/, "");
const indexNowKey = Deno.env.get("INDEXNOW_KEY") ?? "";
if (indexNowKey && !/^[A-Za-z0-9-]{8,128}$/.test(indexNowKey)) {
  throw new Error("INDEXNOW_KEY must be 8 to 128 letters, digits or dashes.");
}
const sha = Deno.env.get("GITHUB_SHA") ?? "";
const repo = Deno.env.get("GITHUB_REPOSITORY") ?? "";
const stamp = {
  version: (await Deno.readTextFile("VERSION")).trim(),
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

const site = new Renderer(meta, members, NAME, stamp.version);

interface Entry {
  file: string;
  url: string | null;
  page: Page;
}

function* pages(): Generator<Entry> {
  yield { file: "index.html", url: "", page: site.home() };
  yield { file: "404.html", url: null, page: site.notFound() };
  for (let i = 0; i < site.packages.length; i++) {
    const url = pkgUrl(site.packages[i]);
    yield { file: `${decodeURIComponent(url)}.html`, url, page: site.pkg(i) };
  }
  for (const c of site.classes) {
    const url = classUrl(c.path);
    yield { file: `${decodeURIComponent(url)}.html`, url, page: site.cls(c) };
  }
}

async function assetHash(text: string): Promise<string> {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const hex = await xxhash128(text);
  let n = BigInt(`0x${hex.match(/../g)!.reverse().join("")}`);
  let hash = "";
  for (; n > 0n; n /= 64n) hash = alphabet[Number(n % 64n)] + hash;
  return hash.padStart(21, "A").slice(0, 8);
}

async function write(path: string, text: string) {
  const file = join(OUT, path);
  await Deno.mkdir(dirname(file), { recursive: true });
  await Deno.writeTextFile(file, text);
}

function breadcrumbs(crumbs: Page["crumbs"]): string {
  if (!siteUrl || !crumbs.length) return "";
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map(([name, url], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: `${siteUrl}/${url}`,
    })),
  }).replaceAll("<", "\\u003c");
}

async function writeSitemaps(urls: string[]) {
  const names: string[] = [];
  for (let i = 0; i < urls.length; i += SITEMAP_LIMIT) {
    const name = `sitemap-${names.length + 1}.xml`;
    names.push(name);
    const entries = urls.slice(i, i + SITEMAP_LIMIT)
      .map((u) => `<url><loc>${esc(u)}</loc></url>`)
      .join("");
    await write(name, `${XML}<urlset xmlns="${NS}">${entries}</urlset>`);
  }
  const entries = names
    .map((n) => `<sitemap><loc>${esc(`${siteUrl}/${n}`)}</loc></sitemap>`)
    .join("");
  await write(
    "sitemap.xml",
    `${XML}<sitemapindex xmlns="${NS}">${entries}</sitemapindex>`,
  );
}

const urls: string[] = [];
let count = 0;
let skipped = 0;
let chars = 0;
let batch: Promise<void>[] = [];
for (const { file, url, page } of pages()) {
  const cardUrl = page.card && url !== null
    ? `assets/og/${url}-${await assetHash(page.card)}.svg`
    : "";
  const html = Mustache.render(template, {
    ...stamp,
    name: NAME,
    title: page.title ? `${page.title} · ${NAME}` : NAME,
    description: page.description,
    canonical: siteUrl && url !== null ? `${siteUrl}/${url}` : "",
    noindex: !page.indexable,
    icon: { [page.icon.toLowerCase()]: true },
    image: siteUrl && cardUrl
      ? `https://wsrv.nl/?url=${
        encodeURIComponent(`${siteUrl}/${cardUrl}`)
      }&output=webp&ll&w=1200&h=600`
      : "",
    jsonld: breadcrumbs(page.crumbs),
    main: page.main,
  });
  if (page.card && cardUrl) {
    batch.push(write(decodeURIComponent(cardUrl), page.card));
  }
  if (url !== null) {
    if (page.indexable) urls.push(`${siteUrl}/${url}`);
    else skipped++;
  }
  count++;
  chars += html.length;
  batch.push(write(file, html));
  if (batch.length >= 64) {
    await Promise.all(batch);
    batch = [];
  }
}
await Promise.all(batch);
if (siteUrl) {
  await writeSitemaps(urls);
  await write(
    "robots.txt",
    `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
  );
}

if (indexNowKey) await write(`${indexNowKey}.txt`, indexNowKey);

console.log(
  `${count.toLocaleString()} pages, ${
    (chars / 1e6).toFixed(1)
  } MB of HTML, ${skipped.toLocaleString()} not indexed`,
);
