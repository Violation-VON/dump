import type { SearchIndex } from "./types.ts";
import { classUrl, esc } from "./shared.ts";

interface Search {
  idx: SearchIndex;
  names: string[];
  lower: string[];
  order: number[];
}

const base = import.meta.env.BASE_URL;

const searchUrls = import.meta.glob<string>("./data/search.json", {
  query: "?url",
  import: "default",
});

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;

const ITEM =
  "group block truncate focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-azure-700 dark:focus-visible:outline-azure-300 px-3 py-px max-md:py-1.5 max-md:text-base hover:bg-steel-300 aria-[current]:bg-steel-300 aria-[current]:font-bold dark:hover:bg-ink-600 dark:aria-[current]:bg-ink-600";
const BADGE =
  "mr-1.5 inline-block w-4 rounded-xs bg-steel-300 text-center text-xs max-md:w-5 max-md:text-sm group-aria-[current]:bg-white dark:bg-ink-600 dark:group-aria-[current]:bg-ink-950 text-steel-700 dark:text-steel-600";
const HEADING =
  "mx-3 mt-2.5 mb-1 text-xs font-bold text-steel-700 dark:text-steel-600";

let listToken = 0;
let searchIndex: Promise<Search> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function readPref(area: () => Storage, key: string): string | null {
  try {
    return area().getItem(key);
  } catch {
    return null;
  }
}

function writePref(area: () => Storage, key: string, value: string) {
  try {
    area().setItem(key, value);
  } catch {
    return;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

function getSearch(): Promise<Search> {
  searchIndex ??= searchUrls["./data/search.json"]()
    .then((url) => fetchJson<SearchIndex>(url))
    .then((idx) => {
      const names = idx.t.map((p) => p.slice(p.lastIndexOf(".") + 1));
      const lower = names.map((n) => n.toLowerCase());
      const order = names
        .map((_, i) => i)
        .sort((a, b) => lower[a] < lower[b] ? -1 : lower[a] > lower[b] ? 1 : 0);
      return { idx, names, lower, order };
    })
    .catch((e) => {
      searchIndex = null;
      throw e;
    });
  return searchIndex;
}

function item(path: string, id: string, badge: string, label: string) {
  const url = classUrl(path);
  const current = !id && base + url === location.pathname;
  return `<a class="${ITEM}" href="${esc(url + id)}" title="${esc(path)}"${
    current ? ' aria-current="page"' : ""
  }><span class="${BADGE}">${badge}</span>${esc(label)}</a>`;
}

async function renderList() {
  const token = ++listToken;
  const list = $("#list");
  const q = $<HTMLInputElement>("#q").value.trim().toLowerCase();
  const nat = $<HTMLInputElement>("#nat").checked;
  if (!searchIndex) list.innerHTML = `<h3 class="${HEADING}">Searching…</h3>`;
  let s: Search;
  try {
    s = await getSearch();
  } catch (e) {
    if (token === listToken) {
      list.innerHTML = `<h3 class="${HEADING}">Failed to load: ${
        esc((e as Error).message)
      }</h3>`;
    }
    return;
  }
  if (token !== listToken) return;

  const { idx, names, lower, order } = s;
  const shown = (i: number) => !nat || idx.t[i].startsWith("/Script/");
  let th = "";
  let ts = 0;
  let total = 0;
  for (const i of order) {
    if (!shown(i) || !lower[i].includes(q)) continue;
    total++;
    if (ts < 400) {
      ts++;
      th += item(idx.t[i], "", idx.s[i], names[i]);
    }
  }
  let h = `<h3 class="${HEADING}">Types (${total.toLocaleString()}${
    total > ts ? `, showing ${ts}` : ""
  })</h3>${th}`;

  if (q.length >= 3) {
    let mh = "";
    let n = 0;
    for (let i = 0; i < idx.n.length; i++) {
      if (!idx.n[i].toLowerCase().includes(q) || !shown(idx.c[i])) continue;
      if (++n > 200) break;
      const m = idx.k[i] === "m";
      mh += item(
        idx.t[idx.c[i]],
        `#${encodeURIComponent(m ? `${idx.n[i]}()` : idx.n[i])}`,
        m ? "m" : "f",
        `${names[idx.c[i]]}.${idx.n[i]}`,
      );
    }
    h += `<h3 class="${HEADING}">${
      n > 200 ? "Members (first 200)" : "Members"
    }</h3>${mh || `<h3 class="${HEADING}">No matches</h3>`}`;
  }
  list.innerHTML = h;
}

function syncQuery() {
  const u = new URL(location.href);
  const q = $<HTMLInputElement>("#q").value.trim();
  if (q) u.searchParams.set("q", q);
  else u.searchParams.delete("q");
  history.replaceState(null, "", u);
  writePref(() => sessionStorage, "q", q);
}

function setMenu(open: boolean) {
  const inside = $("#side").contains(document.activeElement);
  $("#menu").setAttribute("aria-expanded", String(open));
  $("#menu").setAttribute("aria-label", open ? "Close search" : "Search");
  $("#side").toggleAttribute("data-open", open);
  if (open) $("#q").focus();
  else if (inside) $("#menu").focus();
}

document.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName ?? "";
  if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
    e.preventDefault();
    $("#q").focus();
  } else if (e.key === "Escape") {
    if ($("#side").hasAttribute("data-open")) setMenu(false);
    else if (document.activeElement === $("#q")) $("#q").blur();
  }
});

$("#menu").addEventListener("click", () => {
  setMenu($("#menu").getAttribute("aria-expanded") !== "true");
});

$("#side").addEventListener("click", (e) => {
  if ((e.target as Element).closest("a")) setMenu(false);
});

$("#q").addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    syncQuery();
    renderList();
  }, 150);
});

$("#nat").addEventListener("change", () => {
  writePref(
    () => localStorage,
    "native",
    $<HTMLInputElement>("#nat").checked ? "1" : "0",
  );
  renderList();
});

$<HTMLInputElement>("#q").value =
  new URLSearchParams(location.search).get("q") ||
  readPref(() => sessionStorage, "q") || "";
$<HTMLInputElement>("#nat").checked =
  readPref(() => localStorage, "native") !== "0";
renderList();
