import type { Field, Members, Method, TypeDesc } from "../src/types.ts";

const ATTR = /\[(\w+): ([0-9A-Fa-f]+)\]/g;

const SIMPLE: Record<string, string> = {
  FloatProperty: "float",
  DoubleProperty: "double",
  IntProperty: "int32",
  Int8Property: "int8",
  Int16Property: "int16",
  Int64Property: "int64",
  UInt16Property: "uint16",
  UInt32Property: "uint32",
  UInt64Property: "uint64",
  ByteProperty: "uint8",
  BoolProperty: "bool",
  NameProperty: "FName",
  StrProperty: "FString",
  TextProperty: "FText",
  EnumProperty: "enum",
  MapProperty: "TMap",
};

const OBJECT_TYPES = new Set([
  "ObjectProperty",
  "WeakObjectProperty",
  "SoftObjectProperty",
  "LazyObjectProperty",
  "InterfaceProperty",
]);

interface RawClass {
  addr: string;
  path: string;
  pkg: string;
  name: string;
  sup: string | null;
  struct: boolean;
}

interface Typed {
  t: string;
  r: string | null;
  ai: string | null;
}

interface RawProp extends Typed {
  n: string;
  o: number;
}

interface RawMethod {
  n: string;
  ret: RawProp | null;
  params: RawProp[];
}

interface Raw {
  classes: RawClass[];
  members: Map<string, { f: RawProp[]; m: RawMethod[] }>;
  methods: Map<string, RawMethod>;
  inner: Map<string, Typed>;
}

export interface ModelClass {
  path: string;
  name: string;
  pk: number;
  sup: number;
  struct: boolean;
}

export interface Model {
  lines: number;
  packages: string[];
  classes: ModelClass[];
  entries: Map<number, Members>;
  counts: { fields: number; methods: number };
}

async function* readLines(path: string): AsyncGenerator<string> {
  const file = await Deno.open(path);
  const bytes = path.endsWith(".gz")
    ? file.readable.pipeThrough(new DecompressionStream("gzip"))
    : file.readable;
  const reader = bytes.pipeThrough(new TextDecoderStream()).getReader();
  let tail = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = (tail + value).split("\n");
    tail = lines.pop()!;
    yield* lines;
  }
  if (tail) yield tail;
}

function bucket(raw: Raw, owner: string) {
  let value = raw.members.get(owner);
  if (!value) {
    value = { f: [], m: [] };
    raw.members.set(owner, value);
  }
  return value;
}

function method(raw: Raw, owner: string, name: string): RawMethod {
  const key = `${owner}:${name}`;
  let m = raw.methods.get(key);
  if (!m) {
    m = { n: name, ret: null, params: [] };
    raw.methods.set(key, m);
    bucket(raw, owner).m.push(m);
  }
  return m;
}

function ingest(raw: Raw, line: string) {
  if (line.charCodeAt(0) !== 91) return;
  const a = line.indexOf("] ");
  if (a < 0) return;
  const s1 = line.indexOf(" ", a + 2);
  if (s1 < 0) return;
  const type = line.slice(a + 2, s1);
  const isClass = type === "Class" || type === "ScriptStruct";
  const isFunction = type === "Function";
  const isProperty = type.endsWith("Property");
  if (!isClass && !isFunction && !isProperty) return;

  let s2 = line.indexOf(" ", s1 + 1);
  if (s2 < 0) s2 = line.length;
  const path = line.slice(s1 + 1, s2);
  const addr = line.slice(1, a);
  const at: Record<string, string> = {};
  if (s2 < line.length) {
    for (const m of line.slice(s2).matchAll(ATTR)) at[m[1]] = m[2];
  }

  if (isClass) {
    const dot = path.lastIndexOf(".");
    raw.classes.push({
      addr,
      path,
      pkg: dot > 0 ? path.slice(0, dot) : "",
      name: dot > 0 ? path.slice(dot + 1) : path,
      sup: at.sps || null,
      struct: type === "ScriptStruct",
    });
    return;
  }

  const ref = at.pc || at.ss || at.mc || at.ic || null;
  if (path.charCodeAt(0) !== 47) {
    if (isProperty) raw.inner.set(addr, { t: type, r: ref, ai: at.ai || null });
    return;
  }

  const i = path.indexOf(":");
  if (i < 0) return;
  const owner = path.slice(0, i);
  const parts = path.slice(i + 1).split(":");
  if (isFunction) {
    if (parts.length === 1) method(raw, owner, parts[0]);
    return;
  }

  const prop: RawProp = {
    t: type,
    r: ref,
    ai: at.ai || null,
    o: parseInt(at.o || "0", 16),
    n: "",
  };
  if (parts.length === 1) {
    prop.n = parts[0];
    bucket(raw, owner).f.push(prop);
  } else if (parts.length === 2) {
    prop.n = parts[1];
    const m = method(raw, owner, parts[0]);
    if (prop.n === "ReturnValue") m.ret = prop;
    else m.params.push(prop);
  }
}

function byName(a: { n: string }, b: { n: string }) {
  const x = a.n.toLowerCase();
  const y = b.n.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

function resolve(raw: Raw, lines: number): Model {
  const sorted = raw.classes.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  );
  const indexByAddr = new Map<string, number>();
  sorted.forEach((c, i) => indexByAddr.set(c.addr, i));

  const packages: string[] = [];
  const packageIndex = new Map<string, number>();
  const classes = sorted.map((c): ModelClass => {
    let pk = packageIndex.get(c.pkg);
    if (pk === undefined) {
      pk = packages.length;
      packages.push(c.pkg);
      packageIndex.set(c.pkg, pk);
    }
    const sup = c.sup ? indexByAddr.get(c.sup) : undefined;
    return {
      path: c.path,
      name: c.name,
      pk,
      sup: sup === undefined ? -1 : sup,
      struct: c.struct,
    };
  });

  const describe = (p: Typed, depth = 0): TypeDesc => {
    const ci = p.r ? (indexByAddr.get(p.r) ?? -1) : -1;
    if (p.t === "ArrayProperty" || p.t === "SetProperty") {
      const inner = p.ai ? raw.inner.get(p.ai) : undefined;
      return [
        p.t === "SetProperty" ? "S" : "a",
        inner && depth < 3 ? describe(inner, depth + 1) : 0,
      ];
    }
    if (p.t === "ClassProperty" || p.t === "SoftClassProperty") {
      return ["k", ci];
    }
    if (OBJECT_TYPES.has(p.t)) return ["o", ci];
    if (p.t === "StructProperty") return ["s", ci];
    return SIMPLE[p.t] || p.t.replace("Property", "");
  };

  const entries = new Map<number, Members>();
  let fields = 0;
  let methods = 0;
  classes.forEach((c, i) => {
    const mm = raw.members.get(c.path);
    if (!mm || (!mm.f.length && !mm.m.length)) return;
    const f = mm.f
      .slice()
      .sort((a, b) => a.o - b.o)
      .map((p): Field => [p.n, describe(p), p.o]);
    const m = mm.m
      .slice()
      .sort(byName)
      .map((x): Method => [
        x.n,
        x.ret ? describe(x.ret) : 0,
        x.params.map((p): [string, TypeDesc] => [p.n, describe(p)]),
      ]);
    fields += f.length;
    methods += m.length;
    entries.set(i, { f, m });
  });

  return { lines, packages, classes, entries, counts: { fields, methods } };
}

export async function parseDump(path: string): Promise<Model> {
  const raw: Raw = {
    classes: [],
    members: new Map(),
    methods: new Map(),
    inner: new Map(),
  };
  let lines = 0;
  for await (const line of readLines(path)) {
    lines++;
    ingest(raw, line);
  }
  return resolve(raw, lines);
}
