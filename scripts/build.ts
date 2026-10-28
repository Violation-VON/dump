import { type Model, parseDump } from "./parse.ts";
import type { Members, Meta, SearchIndex } from "../src/types.ts";

const SHARD_BYTES = 1_500_000;
const SITE_NAME = "Evrima Object Dump";

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }
}

async function findDump(): Promise<string> {
  const candidates = [
    Deno.env.get("DUMP"),
    "UE4SS_ObjectDump.txt",
    "UE4SS_ObjectDump.txt.gz",
  ];
  for (const path of candidates) {
    if (path && await exists(path)) return path;
  }
  throw new Error("No dump found.");
}

async function readVersion(): Promise<string> {
  try {
    return (await Deno.readTextFile("VERSION")).trim();
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return "";
    throw e;
  }
}

async function write(path: string, text: string) {
  await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await Deno.writeTextFile(path, text);
}

function writeJson(path: string, value: unknown) {
  return write(path, JSON.stringify(value));
}

async function writeShards(model: Model) {
  const shardOf: number[] = new Array(model.classes.length).fill(-1);
  let shard: Record<number, Members> = {};
  let size = 0;
  let count = 0;
  const flush = async () => {
    if (!size) return;
    await writeJson(`dist/data/m/${count}.json`, shard);
    count++;
    shard = {};
    size = 0;
  };
  for (const [i, entry] of model.entries) {
    shard[i] = entry;
    shardOf[i] = count;
    size += JSON.stringify(entry).length;
    if (size >= SHARD_BYTES) await flush();
  }
  await flush();
  return { shardOf, count };
}

function writeSearch(model: Model) {
  const index: SearchIndex = { n: [], c: [], k: "" };
  for (const [i, entry] of model.entries) {
    for (const f of entry.f) {
      index.n.push(f[0]);
      index.c.push(i);
      index.k += "f";
    }
    for (const m of entry.m) {
      index.n.push(m[0]);
      index.c.push(i);
      index.k += "m";
    }
  }
  return writeJson("dist/data/search.json", index);
}

async function writeSite(base: string, build: string) {
  const html = (await Deno.readTextFile("src/index.html"))
    .replaceAll("%BASE%", base)
    .replaceAll("%BUILD%", build)
    .replaceAll("%NAME%", SITE_NAME);
  await write("dist/index.html", html);
  await write("dist/404.html", html);
  await Deno.copyFile("src/style.css", "dist/style.css");
}

const dump = await findDump();
const base = `${(Deno.env.get("BASE_PATH") ?? "").replace(/\/+$/, "")}/`;
const build = Date.now().toString(36);

console.log(`Parsing ${dump}`);
const model = await parseDump(dump);
if (!model.classes.length) {
  throw new Error("No classes found. Is this a UE4SS object dump?");
}

try {
  await Deno.remove("dist", { recursive: true });
} catch (e) {
  if (!(e instanceof Deno.errors.NotFound)) throw e;
}

const { shardOf, count } = await writeShards(model);
await writeSearch(model);
const meta: Meta = {
  build,
  version: await readVersion(),
  commit: Deno.env.get("GITHUB_SHA") ?? "",
  repo: Deno.env.get("GITHUB_REPOSITORY") ?? "",
  source: dump.split(/[\\/]/).pop()!,
  lines: model.lines,
  counts: model.counts,
  pk: model.packages,
  c: model.classes.map((c, i) => [
    c.name,
    c.pk,
    c.sup,
    c.struct ? 1 : 0,
    shardOf[i],
  ]),
  shards: count,
};
await writeJson("dist/data/meta.json", meta);
await writeSite(base, build);

console.log(
  `${model.lines.toLocaleString()} lines, ${model.classes.length.toLocaleString()} classes, ` +
    `${model.counts.fields.toLocaleString()} fields, ${model.counts.methods.toLocaleString()} methods, ` +
    `${count} shards, base ${base}`,
);
