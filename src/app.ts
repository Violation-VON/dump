import type { Members, Meta, SearchIndex, TypeDesc } from "./types.ts";

interface Cls {
  i: number;
  name: string;
  pk: number;
  sup: number;
  shard: number;
  struct: boolean;
  path: string;
}

const { build = "", name = "" } = document.documentElement.dataset;
const base = new URL(document.baseURI).pathname;

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ESCAPES[c]);

let meta: Meta;
let classes: Cls[] = [];
let byName: Cls[] = [];
const byPath = new Map<string, Cls>();
const children = new Map<number, Cls[]>();
const pkgIndex = new Map<string, number>();
const pkgClasses = new Map<number, Cls[]>();
let current: Cls | null = null;
let listToken = 0;
let searchIndex: Promise<SearchIndex> | null = null;
let timer: number | undefined;
const shards = new Map<number, Promise<Record<number, Members>>>();

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

async function fetchJson<T>(file: string): Promise<T> {
  const r = await fetch(`data/${file}?v=${build}`);
  if (!r.ok) throw new Error(`${file}: ${r.status}`);
  return r.json();
}

const ePath = (p: string) => encodeURI(p).replace(/[#?]/g, encodeURIComponent);
const classUrl = (c: Cls, id?: string) =>
  `c${ePath(c.path)}${id ? `#${encodeURIComponent(id)}` : ""}`;
const pkgUrl = (p: string) => `p${ePath(p)}`;
const link = (c: Cls) =>
  `<a class="text-azure-700 hover:underline dark:text-azure-300" href="${esc(classUrl(c))}">${esc(c.name)}</a>`;
const hex = (n: number) => `0x${n.toString(16).toUpperCase()}`;
const isNative = (c: Cls) => c.path.startsWith("/Script/");
const pkgOf = (c: Cls) => meta.pk[c.pk];

function tstr(d: TypeDesc): string {
  if (typeof d === "string") return esc(d);
  switch (d[0]) {
    case "a":
    case "S": {
      const inner = d[1] ? tstr(d[1]) : "?";
      return `${d[0] === "a" ? "TArray" : "TSet"}&lt;${inner}&gt;`;
    }
    case "k": {
      const c = classes[d[1]];
      return `TSubclassOf&lt;${c ? link(c) : "UObject"}&gt;`;
    }
    case "o": {
      const c = classes[d[1]];
      return `${c ? link(c) : "UObject"}*`;
    }
    case "s": {
      const c = classes[d[1]];
      return c ? link(c) : "struct";
    }
  }
}

function loadShard(n: number): Promise<Record<number, Members>> {
  let shard = shards.get(n);
  if (!shard) {
    shard = fetchJson<Record<number, Members>>(`m/${n}.json`).catch((e) => {
      shards.delete(n);
      throw e;
    });
    shards.set(n, shard);
  }
  return shard;
}

async function membersOf(c: Cls): Promise<Members> {
  if (c.shard < 0) return { f: [], m: [] };
  const s = await loadShard(c.shard);
  return s[c.i] || { f: [], m: [] };
}

function getSearch(): Promise<SearchIndex> {
  searchIndex ??= fetchJson<SearchIndex>("search.json");
  return searchIndex;
}

function setTitle(t: string) {
  document.title = t ? `${t} · ${name}` : name;
}

function markActive() {
  document
    .querySelectorAll("#list [aria-current]")
    .forEach((a) => a.removeAttribute("aria-current"));
  if (!current) return;
  document
    .querySelector(`#list a[data-i="${current.i}"]`)
    ?.setAttribute("aria-current", "page");
}

function focusMember(id: string) {
  document
    .querySelectorAll("tr[data-hl]")
    .forEach((r) => r.removeAttribute("data-hl"));
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.setAttribute("data-hl", "");
  el.scrollIntoView({ block: "center" });
}

function inheritedHtml(chain: Cls[], loaded: Members[]): string {
  let h = "";
  chain.forEach((a, k) => {
    const mm = loaded[k];
    if (!mm.f.length && !mm.m.length) return;
    const names = (list: { 0: string }[], suffix: string) =>
      list
        .map((x) =>
          `<a class="text-azure-700 hover:underline dark:text-azure-300" href="${esc(classUrl(a, x[0] + suffix))}">${
            esc(x[0])
          }</a>`
        )
        .join(", ");
    h +=
      `<details class="my-2 text-sm"><summary class="cursor-pointer font-semibold">Inherited from ${
        esc(a.name)
      } (${mm.f.length} fields, ${mm.m.length} methods)</summary>` +
      (mm.f.length ? `<p class="wrap-anywhere my-1.5 ml-4 font-mono"><b>Fields:</b> ${names(mm.f, "")}</p>` : "") +
      (mm.m.length ? `<p class="wrap-anywhere my-1.5 ml-4 font-mono"><b>Methods:</b> ${names(mm.m, "()")}</p>` : "") +
      "</details>";
  });
  return h
    ? `<h2 class="mt-6 rounded-t-sm bg-ink-300 px-3 py-1.5 text-sm font-bold text-white dark:bg-ink-400 dark:text-steel-200">Inherited members</h2><div class="overflow-x-auto border border-t-0 border-steel-500 dark:border-ink-500 px-3 py-1.5">${h}</div>`
    : "";
}

function classHtml(
  c: Cls,
  mm: Members,
  ancestors: Cls[],
  loaded: Members[],
): string {
  const chain: Cls[] = [];
  for (
    let a: Cls | undefined = c;
    a && chain.length < 64;
    a = classes[a.sup]
  ) {
    chain.unshift(a);
  }
  const tree = chain
    .map((a, i) =>
      (i ? `${"   ".repeat(i - 1)}└─ ` : "") +
      (a === c ? `<b>${esc(a.name)}</b>` : link(a))
    )
    .join("\n");
  const kids = children.get(c.i) || [];
  let h = `<div class="wrap-anywhere font-mono text-sm text-steel-700 dark:text-steel-600"><a class="text-azure-700 hover:underline dark:text-azure-300" href="${esc(pkgUrl(pkgOf(c)))}">${
    esc(pkgOf(c))
  }</a></div>`;
  h += `<h1 class="mb-4 font-serif text-3xl font-bold">${c.struct ? "Struct" : "Class"} ${esc(c.name)}</h1>` +
    `<pre class="overflow-auto border border-steel-500 bg-steel-50 px-4 py-3 font-mono text-sm dark:border-ink-500 dark:bg-ink-900">${tree}</pre>`;
  if (kids.length) {
    h += `<div class="my-3 font-serif text-sm"><b>${
      c.struct ? "Child structs" : "Direct subclasses"
    }:</b> ${kids.slice(0, 60).map(link).join(", ")}`;
    h += kids.length > 60 ? ` and ${kids.length - 60} more</div>` : "</div>";
  }
  if (mm.f.length) {
    h += `<h2 class="mt-6 rounded-t-sm bg-ink-300 px-3 py-1.5 text-sm font-bold text-white dark:bg-ink-400 dark:text-steel-200">Field summary</h2><div class="overflow-x-auto border border-t-0 border-steel-500 dark:border-ink-500"><table class="w-full font-mono text-sm">${
      mm.f
        .map(
          ([n, t, o]) =>
            `<tr id="${esc(n)}" class="group data-[hl]:bg-straw-100 dark:data-[hl]:bg-straw-900 border-t border-steel-500 first:border-t-0 even:bg-steel-50 dark:border-ink-500 dark:even:bg-ink-900"><td class="w-px whitespace-nowrap px-3 py-1 text-right align-top">${tstr(t)}</td>` +
            `<td class="px-3 py-1 align-top"><a class="font-bold before:mr-0.5 before:text-steel-700 dark:before:text-steel-600 before:opacity-0 before:content-['#'] hover:underline group-hover:before:opacity-100 group-data-[hl]:before:opacity-100" href="${esc(classUrl(c, n))}">${
              esc(n)
            }</a></td><td class="w-px whitespace-nowrap px-3 py-1 align-top text-steel-700 dark:text-steel-600">${hex(o)}</td></tr>`,
        )
        .join("")
    }</table></div>`;
  }
  if (mm.m.length) {
    h += `<h2 class="mt-6 rounded-t-sm bg-ink-300 px-3 py-1.5 text-sm font-bold text-white dark:bg-ink-400 dark:text-steel-200">Method summary</h2><div class="overflow-x-auto border border-t-0 border-steel-500 dark:border-ink-500"><table class="w-full font-mono text-sm">${
      mm.m
        .map(
          ([n, r, ps]) =>
            `<tr id="${esc(n)}()" class="group data-[hl]:bg-straw-100 dark:data-[hl]:bg-straw-900 border-t border-steel-500 first:border-t-0 even:bg-steel-50 dark:border-ink-500 dark:even:bg-ink-900"><td class="w-px whitespace-nowrap px-3 py-1 text-right align-top">${r ? tstr(r) : "void"}</td>` +
            `<td class="px-3 py-1 align-top"><a class="font-bold before:mr-0.5 before:text-steel-700 dark:before:text-steel-600 before:opacity-0 before:content-['#'] hover:underline group-hover:before:opacity-100 group-data-[hl]:before:opacity-100" href="${esc(classUrl(c, `${n}()`))}">${
              esc(n)
            }</a>` +
            `(${
              ps.map(([pn, pt]) => `${tstr(pt)} ${esc(pn)}`).join(", ")
            })</td></tr>`,
        )
        .join("")
    }</table></div>`;
  }
  if (!mm.f.length && !mm.m.length) {
    h += '<p class="my-4 font-serif text-steel-700 dark:text-steel-600">Nothing declared on this type.</p>';
  }
  return h + inheritedHtml(ancestors, loaded);
}

async function showClass(c: Cls, id: string) {
  const main = $("#main");
  if (current !== c) {
    current = c;
    setTitle(c.name);
    main.innerHTML = '<p class="my-4 font-serif text-steel-700 dark:text-steel-600">Loading…</p>';
    markActive();
    const ancestors: Cls[] = [];
    for (
      let a: Cls | undefined = classes[c.sup];
      a && ancestors.length < 64;
      a = classes[a.sup]
    ) {
      ancestors.push(a);
    }
    try {
      const [mm, ...loaded] = await Promise.all(
        [c, ...ancestors].map(membersOf),
      );
      if (current !== c) return;
      main.innerHTML = classHtml(c, mm, ancestors, loaded);
      main.scrollTop = 0;
    } catch (e) {
      if (current === c) {
        main.innerHTML = `<p class="my-4 font-serif">Failed to load members: ${
          esc((e as Error).message)
        }</p>`;
      }
      return;
    }
  }
  focusMember(id);
}

function showPackage(pkg: string) {
  current = null;
  markActive();
  const list = pkgClasses.get(pkgIndex.get(pkg) ?? -1);
  if (!list) return notFound();
  setTitle(pkg);
  const main = $("#main");
  main.innerHTML =
    `<div class="wrap-anywhere font-mono text-sm text-steel-700 dark:text-steel-600">Package</div><h1 class="mb-4 font-serif text-3xl font-bold">${esc(pkg || "(none)")}</h1>` +
    `<h2 class="mt-6 rounded-t-sm bg-ink-300 px-3 py-1.5 text-sm font-bold text-white dark:bg-ink-400 dark:text-steel-200">Classes and structs (${list.length.toLocaleString()})</h2><div class="overflow-x-auto border border-t-0 border-steel-500 dark:border-ink-500"><table class="w-full font-mono text-sm">` +
    list
      .map(
        (c) =>
          `<tr class="border-t border-steel-500 first:border-t-0 even:bg-steel-50 dark:border-ink-500 dark:even:bg-ink-900"><td class="w-px whitespace-nowrap px-3 py-1 text-right align-top">${c.struct ? "struct" : "class"}</td><td class="px-3 py-1 align-top">${
            link(c)
          }</td>` +
          `<td class="w-px whitespace-nowrap px-3 py-1 align-top text-steel-700 dark:text-steel-600">${
            classes[c.sup] ? `extends ${link(classes[c.sup])}` : ""
          }</td></tr>`,
      )
      .join("") +
    "</table></div>";
  main.scrollTop = 0;
}

function showHome() {
  current = null;
  markActive();
  setTitle("");
  const native = meta.pk
    .map((p, i): [string, number] => [p, pkgClasses.get(i)!.length])
    .filter(([p]) => p.startsWith("/Script/"))
    .sort((a, b) => b[1] - a[1]);
  const structs = classes.filter((c) => c.struct).length;
  const main = $("#main");
  main.innerHTML = `<h1 class="mb-4 font-serif text-3xl font-bold">${esc(name)}</h1>` +
    `<div class="mt-3 mb-2 flex flex-wrap gap-x-8 gap-y-2 text-sm"><span><b class="block text-xl">${
      (classes.length - structs).toLocaleString()
    }</b>classes</span>` +
    `<span><b class="block text-xl">${structs.toLocaleString()}</b>structs</span>` +
    `<span><b class="block text-xl">${meta.counts.fields.toLocaleString()}</b>fields</span>` +
    `<span><b class="block text-xl">${meta.counts.methods.toLocaleString()}</b>methods</span></div>` +
    `<h2 class="mt-6 rounded-t-sm bg-ink-300 px-3 py-1.5 text-sm font-bold text-white dark:bg-ink-400 dark:text-steel-200">Native packages (${native.length})</h2><div class="overflow-x-auto border border-t-0 border-steel-500 dark:border-ink-500"><table class="w-full font-mono text-sm">` +
    native
      .map(
        ([p, n]) =>
          `<tr class="border-t border-steel-500 first:border-t-0 even:bg-steel-50 dark:border-ink-500 dark:even:bg-ink-900"><td class="px-3 py-1 align-top"><a class="text-azure-700 hover:underline dark:text-azure-300" href="${esc(pkgUrl(p))}">${
            esc(p)
          }</a></td><td class="w-px whitespace-nowrap px-3 py-1 align-top text-steel-700 dark:text-steel-600">${n.toLocaleString()}</td></tr>`,
      )
      .join("") +
    "</table></div>";
  main.scrollTop = 0;
}

function notFound() {
  current = null;
  markActive();
  setTitle("Not found");
  $("#main").innerHTML =
    `<h1 class="mb-4 font-serif text-3xl font-bold">Not found</h1><p class="my-4 font-serif">Nothing exists at this address. <a class="text-azure-700 hover:underline dark:text-azure-300" href=".">Back to overview</a></p>`;
}

function route() {
  let path: string;
  let id: string;
  try {
    path = decodeURI(location.pathname.slice(base.length));
    id = decodeURIComponent(location.hash.slice(1));
  } catch {
    return notFound();
  }
  if (path.startsWith("c/")) {
    const c = byPath.get(`/${path.slice(2)}`);
    return c ? showClass(c, id) : notFound();
  }
  if (path.startsWith("p/")) return showPackage(`/${path.slice(2)}`);
  return path === "" || path === "index.html" ? showHome() : notFound();
}

function navigate(href: string) {
  if (href !== location.href) history.pushState(null, "", href);
  route();
}

function item(c: Cls): string {
  return (
    `<a class="group block truncate px-3 py-px hover:bg-steel-300 aria-[current]:bg-steel-300 aria-[current]:font-bold dark:hover:bg-ink-600 dark:aria-[current]:bg-ink-600" href="${esc(classUrl(c))}" data-i="${c.i}" title="${esc(c.path)}">` +
    `<span class="mr-1.5 inline-block w-4 rounded-xs bg-steel-300 text-center text-xs group-aria-[current]:bg-white dark:bg-ink-600 dark:group-aria-[current]:bg-ink-950 text-steel-700 dark:text-steel-600">${c.struct ? "S" : "C"}</span>${esc(c.name)}</a>`
  );
}

async function renderList() {
  const token = ++listToken;
  const q = $<HTMLInputElement>("#q").value.trim().toLowerCase();
  const nat = $<HTMLInputElement>("#nat").checked;
  let h = "";
  let shown = 0;
  let total = 0;
  for (const c of byName) {
    if (nat && !isNative(c)) continue;
    if (q && !c.name.toLowerCase().includes(q)) continue;
    total++;
    if (shown < 400) {
      shown++;
      h += item(c);
    }
  }
  h = `<h3 class="mx-3 mt-3 mb-1 text-xs font-bold text-steel-700 dark:text-steel-600">Types (${total.toLocaleString()}${
    total > shown ? `, showing ${shown}` : ""
  })</h3>${h}`;
  $("#list").innerHTML = h;
  markActive();
  if (q.length < 3) return;

  $("#list").insertAdjacentHTML(
    "beforeend",
    '<div id="mem"><h3 class="mx-3 mt-3 mb-1 text-xs font-bold text-steel-700 dark:text-steel-600">Members</h3><a class="block truncate px-3 py-px hover:bg-steel-300 aria-[current]:bg-steel-300 aria-[current]:font-bold dark:hover:bg-ink-600 dark:aria-[current]:bg-ink-600">Searching…</a></div>',
  );
  const idx = await getSearch();
  if (token !== listToken) return;
  let mh = "";
  let n = 0;
  for (let i = 0; i < idx.n.length; i++) {
    if (!idx.n[i].toLowerCase().includes(q)) continue;
    const c = classes[idx.c[i]];
    if (nat && !isNative(c)) continue;
    if (++n > 200) break;
    const m = idx.k[i] === "m";
    mh +=
      `<a class="group block truncate px-3 py-px hover:bg-steel-300 aria-[current]:bg-steel-300 aria-[current]:font-bold dark:hover:bg-ink-600 dark:aria-[current]:bg-ink-600" href="${esc(classUrl(c, m ? `${idx.n[i]}()` : idx.n[i]))}" title="${
        esc(c.path)
      }">` +
      `<span class="mr-1.5 inline-block w-4 rounded-xs bg-steel-300 text-center text-xs group-aria-[current]:bg-white dark:bg-ink-600 dark:group-aria-[current]:bg-ink-950 text-steel-700 dark:text-steel-600">${m ? "m" : "f"}</span>${esc(c.name)}.${
        esc(idx.n[i])
      }</a>`;
  }
  $("#mem").innerHTML = `<h3 class="mx-3 mt-3 mb-1 text-xs font-bold text-steel-700 dark:text-steel-600">${
    n > 200 ? "Members (first 200)" : "Members"
  }</h3>${mh || '<a class="block truncate px-3 py-px hover:bg-steel-300 aria-[current]:bg-steel-300 aria-[current]:font-bold dark:hover:bg-ink-600 dark:aria-[current]:bg-ink-600">No matches</a>'}`;
}

function syncQuery() {
  const u = new URL(location.href);
  const q = $<HTMLInputElement>("#q").value.trim();
  if (q) u.searchParams.set("q", q);
  else u.searchParams.delete("q");
  history.replaceState(null, "", u);
}

function stamp() {
  const version = meta.version ? `Server ${esc(meta.version)}` : "";
  const commit = meta.repo && meta.commit
    ? `<a class="hover:underline" href="https://github.com/${esc(meta.repo)}/commit/${
      esc(meta.commit)
    }">${esc(meta.commit.slice(0, 7))}</a>`
    : "";
  $("#stamp").innerHTML = [version, commit].filter(Boolean).join(" · ");
}

async function init() {
  meta = await fetchJson<Meta>("meta.json");
  classes = meta.c.map(([n, pk, sup, st, shard], i) => ({
    i,
    name: n,
    pk,
    sup,
    shard,
    struct: !!st,
    path: meta.pk[pk] ? `${meta.pk[pk]}.${n}` : n,
  }));
  meta.pk.forEach((p, i) => {
    pkgIndex.set(p, i);
    pkgClasses.set(i, []);
  });
  for (const c of classes) {
    byPath.set(c.path, c);
    pkgClasses.get(c.pk)!.push(c);
    if (c.sup >= 0) {
      if (!children.has(c.sup)) children.set(c.sup, []);
      children.get(c.sup)!.push(c);
    }
  }
  byName = classes.slice().sort((a, b) => {
    const x = a.name.toLowerCase();
    const y = b.name.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
  stamp();
  const params = new URLSearchParams(location.search);
  $<HTMLInputElement>("#q").value = params.get("q") || "";
  $<HTMLInputElement>("#nat").checked = readPref("native") !== "0";
  renderList();
  route();
}

document.addEventListener("click", (e) => {
  if (
    e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey ||
    e.altKey
  ) return;
  const a = (e.target as Element).closest<HTMLAnchorElement>("a[href]");
  if (!a || a.target || a.hasAttribute("download")) return;
  if (a.origin !== location.origin || !a.pathname.startsWith(base)) return;
  e.preventDefault();
  navigate(a.href);
});

document.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName ?? "";
  if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
    e.preventDefault();
    $("#q").focus();
  } else if (e.key === "Escape" && document.activeElement === $("#q")) {
    $("#q").blur();
  }
});

$("#q").addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    syncQuery();
    renderList();
  }, 150);
});

$("#nat").addEventListener("change", () => {
  writePref("native", $<HTMLInputElement>("#nat").checked ? "1" : "0");
  renderList();
});

addEventListener("popstate", route);

init().catch((e: Error) => {
  $("#main").innerHTML = `<h1 class="mb-4 font-serif text-3xl font-bold">Failed to load</h1><p class="my-4 font-serif">${esc(e.message)}</p>`;
});
