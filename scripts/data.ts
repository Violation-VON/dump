import { type Model, parseDump } from "./parse.ts";
import type { Members, Meta, SearchIndex } from "../src/types.ts";

const OUT = "src/data";
const STAMP = `${OUT}/stamp`;
const SHARD_BYTES = 1_500_000;
const SOURCES = ["scripts/data.ts", "scripts/parse.ts", "src/types.ts"];

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

function hex(buffer: ArrayBuffer): string {
  return Array.from(
    new Uint8Array(buffer),
    (b) => b.toString(16).padStart(2, "0"),
  )
    .join("");
}

async function fingerprint(dump: string): Promise<string> {
  const dumpHash = hex(
    await crypto.subtle.digest("SHA-256", await Deno.readFile(dump)),
  );
  const sources = await Promise.all(SOURCES.map((s) => Deno.readTextFile(s)));
  const sourceHash = hex(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(sources.join("\0")),
    ),
  );
  return `${dumpHash}:${sourceHash}`;
}

async function readStamp(): Promise<string | null> {
  try {
    return await Deno.readTextFile(STAMP);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return null;
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
    await writeJson(`${OUT}/m/${count}.json`, shard);
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
  return writeJson(`${OUT}/search.json`, index);
}

const dump = await findDump();
const stamp = await fingerprint(dump);

if (!Deno.args.includes("--force") && await readStamp() === stamp) {
  console.log("Data is up to date.");
} else {
  console.log(`Parsing ${dump}`);
  const model = await parseDump(dump);
  if (!model.classes.length) {
    throw new Error("No classes found. Is this a UE4SS object dump?");
  }

  await Deno.remove(OUT, { recursive: true }).catch((e) => {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  });

  const { shardOf, count } = await writeShards(model);
  await writeSearch(model);
  const meta: Meta = {
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
  await writeJson(`${OUT}/meta.json`, meta);
  await write(STAMP, stamp);

  console.log(
    `${model.lines.toLocaleString()} lines, ${model.classes.length.toLocaleString()} classes, ` +
      `${model.counts.fields.toLocaleString()} fields, ${model.counts.methods.toLocaleString()} methods, ` +
      `${count} shards`,
  );
}
