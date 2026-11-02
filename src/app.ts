import type { SearchIndex } from "./types.ts";
import { collator, esc, isNative, typeUrl } from "./shared.ts";

interface Search {
  idx: SearchIndex;
  names: string[];
  lower: string[];
  memberLower: string[];
  order: number[];
}

const base = import.meta.env.BASE_URL;

const searchUrls = import.meta.glob<string>("./data/search.json", {
  query: "?url",
  import: "default",
});

const input = document.querySelector<HTMLInputElement>("#q")!;
const nativeOnly = document.querySelector<HTMLInputElement>("#nat")!;
const list = document.querySelector<HTMLElement>("#list")!;
const side = document.querySelector<HTMLElement>("#side")!;
const menu = document.querySelector<HTMLButtonElement>("#menu")!;
const main = document.querySelector<HTMLElement>("main")!;
const navigationProgress = document.querySelector<HTMLElement>(
  "#navigation-progress",
)!;

const ITEM =
  "group block truncate focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-azure-700 dark:focus-visible:outline-azure-300 px-3 py-px max-md:py-1.5 max-md:text-base hover:bg-steel-300 aria-[current]:bg-steel-300 aria-[current]:font-bold dark:hover:bg-ink-600 dark:aria-[current]:bg-ink-600";
const BADGE =
  "mr-1.5 inline-block w-4 rounded-xs bg-steel-300 text-center text-xs max-md:w-5 max-md:text-sm group-aria-[current]:bg-white dark:bg-ink-600 dark:group-aria-[current]:bg-ink-950 text-steel-700 dark:text-steel-600";
const SIDEBAR_HEADING =
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
        .sort((a, b) => collator.compare(names[a], names[b]));
      const memberLower = idx.n.map((n) => n.toLowerCase());
      return { idx, names, lower, memberLower, order };
    })
    .catch((e) => {
      searchIndex = null;
      throw e;
    });
  return searchIndex;
}

function item(path: string, id: string, badge: string, label: string) {
  return `<a class="${ITEM}" href="${esc(typeUrl(path) + id)}" title="${
    esc(path)
  }"><span class="${BADGE}">${badge}</span>${esc(label)}</a>`;
}

function markCurrent() {
  for (const a of list.querySelectorAll("a")) {
    if (!a.hash && a.pathname === location.pathname) {
      a.setAttribute("aria-current", "page");
    } else {
      a.removeAttribute("aria-current");
    }
  }
}

async function renderList() {
  const token = ++listToken;
  const q = input.value.trim().toLowerCase();
  const nat = nativeOnly.checked;
  if (!searchIndex) {
    list.innerHTML = `<p class="${SIDEBAR_HEADING}">Searching…</p>`;
  }
  let s: Search;
  try {
    s = await getSearch();
  } catch (e) {
    if (token === listToken) {
      list.innerHTML = `<p class="${SIDEBAR_HEADING}">Failed to load: ${
        esc((e as Error).message)
      }</p>`;
    }
    return;
  }
  if (token !== listToken) return;

  const { idx, names, lower, memberLower, order } = s;
  const shown = (i: number) => !nat || isNative(idx.t[i]);
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
  let h = `<h3 class="${SIDEBAR_HEADING}">Types (${total.toLocaleString()}${
    total > ts ? `, showing ${ts}` : ""
  })</h3>${th}`;

  if (q.length >= 3) {
    let mh = "";
    let n = 0;
    for (let i = 0; i < idx.n.length; i++) {
      if (!memberLower[i].includes(q) || !shown(idx.o[i])) continue;
      if (++n > 200) break;
      const m = idx.k[i] === "m";
      mh += item(
        idx.t[idx.o[i]],
        `#${encodeURIComponent(m ? `${idx.n[i]}()` : idx.n[i])}`,
        idx.k[i],
        `${names[idx.o[i]]}.${idx.n[i]}`,
      );
    }
    h += `<h3 class="${SIDEBAR_HEADING}">${
      n > 200 ? "Members (first 200)" : "Members"
    }</h3>${mh || `<p class="${SIDEBAR_HEADING}">No matches</p>`}`;
  }
  list.innerHTML = h;
  markCurrent();
}

function syncQuery() {
  const u = new URL(location.href);
  const q = input.value.trim();
  if (q) u.searchParams.set("q", q);
  else u.searchParams.delete("q");
  history.replaceState(history.state, "", u);
  writePref(() => sessionStorage, "q", q);
}

function setMenu(open: boolean) {
  const inside = side.contains(document.activeElement);
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute("aria-label", open ? "Close search" : "Search");
  side.toggleAttribute("data-open", open);
  if (open) input.focus();
  else if (inside) menu.focus();
}

document.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName ?? "";
  if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
    e.preventDefault();
    input.focus();
  } else if (e.key === "Escape") {
    if (side.hasAttribute("data-open")) setMenu(false);
    else if (document.activeElement === input) input.blur();
  }
});

menu.addEventListener("click", () => {
  setMenu(menu.getAttribute("aria-expanded") !== "true");
});

side.addEventListener("click", (e) => {
  if ((e.target as Element).closest("a")) setMenu(false);
});

input.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    syncQuery();
    renderList();
  }, 150);
});

nativeOnly.addEventListener("change", () => {
  writePref(() => localStorage, "native", nativeOnly.checked ? "1" : "0");
  renderList();
});

input.value = new URLSearchParams(location.search).get("q") ||
  readPref(() => sessionStorage, "q") || "";
nativeOnly.checked = readPref(() => localStorage, "native") !== "0";
renderList();

let progressShowTimer: ReturnType<typeof setTimeout> | undefined;
let progressStepTimer: ReturnType<typeof setInterval> | undefined;
let progressFinishTimer: ReturnType<typeof setTimeout> | undefined;
let progressValue = 0;
let progressVisible = false;

function showProgress() {
  if (progressVisible) return;
  progressVisible = true;
  progressValue = 0.08;
  navigationProgress.hidden = false;
  navigationProgress.classList.remove("opacity-0");
  navigationProgress.style.scale = `${progressValue} 1`;

  progressStepTimer = setInterval(() => {
    progressValue += (0.9 - progressValue) * 0.16;
    navigationProgress.style.scale = `${progressValue} 1`;
  }, 180);
}

function startProgress() {
  clearTimeout(progressFinishTimer);
  clearTimeout(progressShowTimer);

  if (progressVisible) {
    if (progressValue >= 1) {
      progressValue = 0.9;
      navigationProgress.style.scale = `${progressValue} 1`;
    }
    return;
  }

  progressShowTimer = setTimeout(showProgress, 120);
}

function finishProgress() {
  clearTimeout(progressShowTimer);
  clearInterval(progressStepTimer);

  if (!progressVisible) return;

  progressValue = 1;
  navigationProgress.style.scale = "1 1";
  navigationProgress.classList.add("opacity-0");

  progressFinishTimer = setTimeout(() => {
    navigationProgress.hidden = true;
    navigationProgress.classList.remove("opacity-0");
    navigationProgress.style.scale = "0 1";
    progressValue = 0;
    progressVisible = false;
  }, 320);
}

let scrollTimer: ReturnType<typeof setTimeout> | undefined;

function saveScroll() {
  clearTimeout(scrollTimer);
  history.replaceState(
    { ...history.state, scrollTop: main.scrollTop },
    "",
    location.href,
  );
}

main.addEventListener("scroll", () => {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(saveScroll, 150);
}, { passive: true });

let displayedPage = location.pathname + location.search;
let navigation: AbortController | undefined;

async function navigate(url: URL, push: boolean, scrollTop?: number) {
  navigation?.abort();

  const controller = new AbortController();
  navigation = controller;
  startProgress();

  if (push) saveScroll();
  else clearTimeout(scrollTimer);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "text/html" },
    });

    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("text/html")
    ) {
      throw new Error(`Unexpected response: ${response.status}`);
    }

    const doc = new DOMParser().parseFromString(
      await response.text(),
      "text/html",
    );
    const nextMain = doc.querySelector("main");

    if (!nextMain || !doc.title) throw new Error("Invalid page response");
    if (controller.signal.aborted) return;

    main.replaceChildren(...nextMain.childNodes);
    document.title = doc.title;

    const metadata = [
      'meta[name="description"]',
      'meta[name="robots"]',
      'meta[property^="og:"]',
      'link[rel="canonical"]',
      'script[type="application/ld+json"]',
      'link[rel="icon"]',
    ].join(",");

    document.head.querySelectorAll(metadata).forEach((node) => node.remove());
    document.head.append(
      ...Array.from(
        doc.head.querySelectorAll(metadata),
        (node) => document.importNode(node, true),
      ),
    );

    if (push) history.pushState({ scrollTop: 0 }, "", url.href);
    displayedPage = url.pathname + url.search;
    if (url.hash) location.replace(url.href);

    markCurrent();

    requestAnimationFrame(() => {
      if (controller.signal.aborted) return;

      if (typeof scrollTop === "number") {
        main.scrollTop = scrollTop;
      } else if (url.hash) {
        let target: HTMLElement | null = null;
        try {
          target = document.getElementById(
            decodeURIComponent(url.hash.slice(1)),
          );
        } catch {
          target = null;
        }
        if (target) target.scrollIntoView();
        else main.scrollTop = 0;
      } else {
        main.scrollTop = 0;
      }

      if (!url.hash) main.focus({ preventScroll: true });
    });
  } catch {
    if (controller.signal.aborted) return;
    if (push) location.assign(url.href);
    else location.reload();
  } finally {
    if (navigation === controller) {
      navigation = undefined;
      finishProgress();
    }
  }
}

document.addEventListener("click", (event) => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) return;

  if (!(event.target instanceof Element)) return;

  const link = event.target.closest<HTMLAnchorElement>("a[href]");

  if (
    !link ||
    (link.target && link.target !== "_self") ||
    link.hasAttribute("download") ||
    link.relList.contains("external")
  ) return;

  const url = new URL(link.href);

  if (
    url.origin !== location.origin ||
    !url.pathname.startsWith(base) ||
    (url.pathname === location.pathname && url.search === location.search)
  ) return;

  event.preventDefault();
  void navigate(url, true);
});

self.addEventListener("popstate", (event) => {
  if (location.pathname + location.search === displayedPage) return;
  void navigate(new URL(location.href), false, event.state?.scrollTop);
});
