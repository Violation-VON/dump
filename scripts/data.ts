import { type Model, parseDump } from "./parse.ts";
import type { Meta, SearchIndex } from "../src/types.ts";
import { write } from "./write.ts";

const OUT = "src/data";
const STAMP = `${OUT}/stamp`;
const SOURCES = ["scripts/data.ts", "scripts/parse.ts", "src/types.ts"];

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

function writeJson(path: string, value: unknown) {
  return write(path, JSON.stringify(value));
}

function writeMembers(model: Model) {
  return writeJson(`${OUT}/members.json`, Object.fromEntries(model.entries));
}

function writeSearch(model: Model) {
  const index: SearchIndex = {
    t: model.classes.map((c) => c.path),
    s: model.classes.map((c) => c.struct ? "S" : "C").join(""),
    n: [],
    c: [],
    k: "",
  };
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

const dump = "UE4SS_ObjectDump.txt";
const stamp = await fingerprint(dump);

if (await readStamp() === stamp) {
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

  await writeMembers(model);
  await writeSearch(model);
  const meta: Meta = {
    counts: model.counts,
    pk: model.packages,
    c: model.classes.map((c) => [c.name, c.pk, c.sup, c.struct ? 1 : 0]),
  };
  await writeJson(`${OUT}/meta.json`, meta);
  await write(STAMP, stamp);

  console.log(
    `${model.classes.length.toLocaleString()} classes, ` +
      `${model.counts.fields.toLocaleString()} fields, ` +
      `${model.counts.methods.toLocaleString()} methods`,
  );
}
