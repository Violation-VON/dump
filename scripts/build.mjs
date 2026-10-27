import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDump } from './parse.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const SHARD_BYTES = 1_500_000;

function findDump() {
  const candidates = [process.env.DUMP, 'UE4SS_ObjectDump.txt', 'UE4SS_ObjectDump.txt.gz']
    .filter(Boolean)
    .map((p) => resolve(root, p));
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error('No dump found.');
  }
  return found;
}

function normalizeBase(value) {
  return `${(value || '').replace(/\/+$/, '')}/`;
}

async function writeJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

async function writeShards(model) {
  const shardOf = new Array(model.classes.length).fill(-1);
  let shard = {};
  let size = 0;
  let count = 0;
  const flush = async () => {
    if (!size) return;
    await writeJson(join(dist, 'data', 'm', `${count}.json`), shard);
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

async function writeSearch(model) {
  const n = [];
  const c = [];
  let k = '';
  for (const [i, entry] of model.entries) {
    for (const f of entry.f) {
      n.push(f[0]);
      c.push(i);
      k += 'f';
    }
    for (const m of entry.m) {
      n.push(m[0]);
      c.push(i);
      k += 'm';
    }
  }
  await writeJson(join(dist, 'data', 'search.json'), { n, c, k });
}

async function writeSite(base, build) {
  const html = (await readFile(join(root, 'src', 'index.html'), 'utf8'))
    .replaceAll('%BASE%', base)
    .replaceAll('%BUILD%', build);
  await writeFile(join(dist, 'index.html'), html);
  await writeFile(join(dist, '404.html'), html);
  await copyFile(join(root, 'src', 'style.css'), join(dist, 'style.css'));
  await copyFile(join(root, 'src', 'app.js'), join(dist, 'app.js'));
}

const dump = findDump();
const base = normalizeBase(process.env.BASE_PATH);
const build = Date.now().toString(36);

console.log(`Parsing ${basename(dump)}`);
const model = await parseDump(dump);
if (!model.classes.length) throw new Error('No classes found. Is this a UE4SS object dump?');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const { shardOf, count } = await writeShards(model);
await writeSearch(model);
await writeJson(join(dist, 'data', 'meta.json'), {
  build,
  generated: new Date().toISOString(),
  commit: process.env.GITHUB_SHA || '',
  repo: process.env.GITHUB_REPOSITORY || '',
  source: basename(dump),
  lines: model.lines,
  counts: model.counts,
  pk: model.packages,
  c: model.classes.map((c, i) => [c.name, c.pk, c.sup, c.struct ? 1 : 0, shardOf[i]]),
  shards: count,
});
await writeSite(base, build);

console.log(
  `${model.lines.toLocaleString()} lines, ${model.classes.length.toLocaleString()} classes, ` +
    `${model.counts.fields.toLocaleString()} fields, ${model.counts.methods.toLocaleString()} methods, ` +
    `${count} shards, base ${base}`,
);
