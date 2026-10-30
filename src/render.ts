import type { Members, Meta, TypeDesc } from "./types.ts";
import { classUrl, esc, pkgUrl } from "./shared.ts";

export interface Cls {
  i: number;
  name: string;
  pk: number;
  sup: number;
  struct: boolean;
  path: string;
}

export const ICONS = ["C", "S", "P", "E"] as const;
export type Icon = (typeof ICONS)[number];

export interface Page {
  title: string;
  description: string;
  indexable: boolean;
  icon: Icon;
  crumbs: [name: string, url: string][];
  card: string | null;
  main: string;
}

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-azure-700 dark:focus-visible:outline-azure-300";
const LINK = `text-azure-700 hover:underline dark:text-azure-300 ${FOCUS}`;
const LINKS =
  "[&_a]:text-azure-700 [&_a]:hover:underline dark:[&_a]:text-azure-300 [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-offset-1 [&_a]:focus-visible:outline-azure-700 dark:[&_a]:focus-visible:outline-azure-300";
const MUTED = "text-steel-700 dark:text-steel-600";
const HEADING =
  "mt-6.5 rounded-t-sm bg-ink-300 px-2.5 py-1.5 text-sm font-bold text-white dark:bg-ink-400 dark:text-steel-200";
const BOX =
  "overflow-x-auto border border-t-0 border-steel-500 dark:border-ink-500";
const ROW =
  "border-t border-steel-500 first:border-t-0 even:bg-steel-50 dark:border-ink-500 dark:even:bg-ink-900";
const TYPE_CELL = "w-px whitespace-nowrap px-2.5 py-1.25 text-right align-top";
const CELL = "px-2.5 py-1.25 align-top";
const DIM_CELL = `w-px whitespace-nowrap px-2.5 py-1.25 align-top ${MUTED}`;
const MEMBER =
  `font-bold ${FOCUS} before:mr-0.5 before:text-steel-700 dark:before:text-steel-600 before:opacity-0 before:content-['#'] hover:underline group-hover:before:opacity-100 group-[:target]:before:opacity-100`;
const MEMBER_ROW = `group target:bg-straw-100 dark:target:bg-straw-900 ${ROW}`;

export class Renderer {
  public readonly classes: Cls[];
  public readonly packages: string[];
  private readonly children = new Map<number, Cls[]>();
  private readonly pkgClasses: Cls[][];

  public constructor(
    private readonly meta: Meta,
    private readonly members: Map<number, Members>,
    private readonly name: string,
    private readonly version: string,
  ) {
    this.packages = meta.pk;
    this.classes = meta.c.map(([n, pk, sup, st], i) => ({
      i,
      name: n,
      pk,
      sup,
      struct: !!st,
      path: meta.pk[pk] ? `${meta.pk[pk]}.${n}` : n,
    }));
    this.pkgClasses = meta.pk.map((): Cls[] => []);
    for (const c of this.classes) {
      this.pkgClasses[c.pk].push(c);
      if (c.sup >= 0) {
        if (!this.children.has(c.sup)) this.children.set(c.sup, []);
        this.children.get(c.sup)!.push(c);
      }
    }
  }

  public home(): Page {
    const sizes = this.meta.pk
      .map((p, i): [string, number] => [p, this.pkgClasses[i].length])
      .sort((a, b) => b[1] - a[1]);
    const native = sizes.filter(([p]) => p.startsWith("/Script/"));
    const other = sizes.filter(([p]) => !p.startsWith("/Script/"));
    const structs = this.classes.filter((c) => c.struct).length;
    return {
      title: "",
      description:
        `${this.game} documentation of UE4SS classes, structs, fields, and methods.`,
      indexable: true,
      icon: "E",
      crumbs: [],
      card: null,
      main:
        `<h1 class="mb-3.5 font-serif text-3xl font-bold">${
          esc(this.name)
        }</h1>` +
        `<div class="mt-3 mb-2 flex flex-wrap gap-x-7 gap-y-2 text-sm"><span><b class="block text-xl">${
          (this.classes.length - structs).toLocaleString()
        }</b>classes</span>` +
        `<span><b class="block text-xl">${structs.toLocaleString()}</b>structs</span>` +
        `<span><b class="block text-xl">${this.meta.counts.fields.toLocaleString()}</b>fields</span>` +
        `<span><b class="block text-xl">${this.meta.counts.methods.toLocaleString()}</b>methods</span></div>` +
        this.pkgTable("Native packages", native) +
        (other.length ? this.pkgTable("Other packages", other) : ""),
    };
  }

  private pkgTable(title: string, list: [string, number][]): string {
    return `<h2 class="${HEADING}">${title} (${list.length})</h2><div class="${BOX}"><table class="w-full font-mono text-sm">` +
      list
        .map(
          ([p, n]) =>
            `<tr class="${ROW}"><td class="${CELL}"><a class="${LINK}" href="${
              esc(pkgUrl(p))
            }">${
              esc(p || "(none)")
            }</a></td><td class="${DIM_CELL}">${n.toLocaleString()}</td></tr>`,
        )
        .join("") +
      "</table></div>";
  }

  public notFound(): Page {
    return {
      title: "Not found",
      description: "",
      indexable: false,
      icon: "E",
      crumbs: [],
      card: null,
      main:
        `<h1 class="mb-3.5 font-serif text-3xl font-bold">Not found</h1><p class="my-4 font-serif">Nothing exists at this address. <a class="${LINK}" href=".">Back to overview</a></p>`,
    };
  }

  public pkg(i: number): Page {
    const pkg = this.meta.pk[i];
    const list = this.pkgClasses[i];
    const structs = list.filter((c) => c.struct).length;
    return {
      title: `${pkg || "(none)"} package`,
      description: `${this.game} documentation of package ${
        pkg || "(none)"
      }: its classes and structs.`,
      indexable: true,
      icon: "P",
      crumbs: [[this.name, ""], [pkg || "(none)", pkgUrl(pkg)]],
      card: this.card("P", "Package", pkg || "(none)", "", "", [
        [list.length - structs, "classes"],
        [structs, "structs"],
      ]),
      main:
        `<div class="wrap-anywhere font-mono text-sm ${MUTED}">Package</div><h1 class="mb-3.5 font-serif text-3xl font-bold">${
          esc(pkg || "(none)")
        }</h1>` +
        `<h2 class="${HEADING}">Classes and structs (${list.length.toLocaleString()})</h2><div class="${BOX}"><table class="w-full font-mono text-sm">` +
        list
          .map(
            (c) =>
              `<tr class="${ROW}"><td class="${TYPE_CELL}">${
                c.struct ? "struct" : "class"
              }</td><td class="${CELL}">${this.link(c)}</td>` +
              `<td class="${DIM_CELL}">${
                this.classes[c.sup]
                  ? `extends ${this.link(this.classes[c.sup])}`
                  : ""
              }</td></tr>`,
          )
          .join("") +
        "</table></div>",
    };
  }

  public cls(c: Cls): Page {
    const ancestors: Cls[] = [];
    for (
      let a: Cls | undefined = this.classes[c.sup];
      a && ancestors.length < 64;
      a = this.classes[a.sup]
    ) {
      ancestors.push(a);
    }
    const mm = this.membersOf(c);
    const chain: Cls[] = [];
    for (
      let a: Cls | undefined = c;
      a && chain.length < 64;
      a = this.classes[a.sup]
    ) {
      chain.unshift(a);
    }
    const tree = chain
      .map((a, i) =>
        (i ? `${"   ".repeat(i - 1)}└─ ` : "") +
        (a === c ? `<b>${esc(a.name)}</b>` : this.link(a))
      )
      .join("\n");
    const kids = this.children.get(c.i) || [];
    const pkg = this.meta.pk[c.pk];
    let h =
      `<div class="wrap-anywhere font-mono text-sm ${MUTED}"><a class="${LINK}" href="${
        esc(pkgUrl(pkg))
      }">${esc(pkg)}</a></div>`;
    h +=
      `<h1 class="mb-3.5 font-serif text-3xl font-bold">${
        c.struct ? "Struct" : "Class"
      } ${esc(c.name)}</h1>` +
      `<pre class="overflow-auto border border-steel-500 bg-steel-50 px-3.5 py-2.5 font-mono text-sm dark:border-ink-500 dark:bg-ink-900">${tree}</pre>`;
    if (kids.length) {
      h += `<div class="my-2.5 font-serif text-sm"><b>${
        c.struct ? "Child structs" : "Direct subclasses"
      }:</b> ${kids.slice(0, 60).map((k) => this.link(k)).join(", ")}`;
      h += kids.length > 60 ? ` and ${kids.length - 60} more</div>` : "</div>";
    }
    if (mm.f.length) {
      h +=
        `<h2 class="${HEADING}">Field summary</h2><div class="${BOX}"><table class="w-full font-mono text-sm">${
          mm.f
            .map(
              ([n, t, o]) =>
                `<tr id="${
                  esc(n)
                }" class="${MEMBER_ROW}"><td class="${TYPE_CELL}">${
                  this.tstr(t)
                }</td>` +
                `<td class="${CELL}"><a class="${MEMBER}" href="${
                  esc(classUrl(c.path, n))
                }">${esc(n)}</a></td><td class="${DIM_CELL}">${
                  this.hex(o)
                }</td></tr>`,
            )
            .join("")
        }</table></div>`;
    }
    if (mm.m.length) {
      h +=
        `<h2 class="${HEADING}">Method summary</h2><div class="${BOX}"><table class="w-full font-mono text-sm">${
          mm.m
            .map(
              ([n, r, ps]) =>
                `<tr id="${
                  esc(n)
                }()" class="${MEMBER_ROW}"><td class="${TYPE_CELL}">${
                  r ? this.tstr(r) : "void"
                }</td>` +
                `<td class="${CELL}"><a class="${MEMBER}" href="${
                  esc(classUrl(c.path, `${n}()`))
                }">${esc(n)}</a>` +
                `(${
                  ps.map(([pn, pt]) => `${this.tstr(pt)} ${esc(pn)}`).join(", ")
                })</td></tr>`,
            )
            .join("")
        }</table></div>`;
    }
    if (!mm.f.length && !mm.m.length) {
      h +=
        `<p class="my-4 font-serif ${MUTED}">Nothing declared on this type.</p>`;
    }
    const parent = this.classes[c.sup];
    const kind = c.struct ? "struct" : "class";
    const stats: [number, string][] = [[mm.f.length, "fields"]];
    if (!c.struct || mm.m.length) stats.push([mm.m.length, "methods"]);
    return {
      title: `${c.name} ${kind} (${pkg})`,
      description: `${this.game} documentation of ${kind} ${c.name}${
        pkg ? ` in package ${pkg}` : ""
      }${parent ? `, which extends ${parent.name}` : ""}.`,
      indexable: mm.f.length + mm.m.length > 0,
      icon: c.struct ? "S" : "C",
      crumbs: [
        [this.name, ""],
        [pkg || "(none)", pkgUrl(pkg)],
        [c.name, classUrl(c.path)],
      ],
      card: this.card(
        c.struct ? "S" : "C",
        c.struct ? "Struct" : "Class",
        c.name,
        pkg,
        parent ? parent.name : "",
        stats,
      ),
      main: h + this.inherited(ancestors),
    };
  }

  private card(
    icon: Icon,
    kind: string,
    name: string,
    pkg: string,
    parent: string,
    stats: [number, string][],
  ): string {
    const cut = (s: string, n: number) =>
      s.length > n ? `${s.slice(0, n - 1)}…` : s;
    const mono = "ui-monospace, Menlo, Consolas, monospace";
    const grey = "#5b6678";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300"><path fill="#f4f6f9" d="M0 0h600v300H0z"/><g transform="translate(24 24)">` +
      (pkg
        ? `<text y="12" fill="#0a4ea3" font-family="${mono}" font-size="14">${
          esc(cut(pkg, 64))
        }</text>`
        : "") +
      `<rect width="32" height="32" y="30" fill="#e3e9f2" rx="6"/>` +
      `<text x="16" y="55" fill="${grey}" font-family="${mono}" font-size="24" font-weight="700" text-anchor="middle">${icon}</text>` +
      `<text x="42" y="55" fill="#000" font-family="Arial, sans-serif" font-size="25" font-weight="700">${kind} <tspan font-family="${mono}">${
        esc(cut(name, 28))
      }</tspan></text>` +
      (parent
        ? `<text x="42" y="80" fill="${grey}" font-family="Arial, sans-serif" font-size="16">extends <tspan font-family="${mono}">${
          esc(cut(parent, 46))
        }</tspan></text>`
        : "") +
      `<g font-family="Arial, sans-serif" transform="translate(0 220)">` +
      stats
        .map(([n, label], i) =>
          `<text x="${
            i * 60
          }" fill="#000" font-size="20" font-weight="500">${n.toLocaleString()}</text><text x="${
            i * 60
          }" y="20" fill="${grey}" font-size="13">${label}</text>`
        )
        .join("") +
      `<text x="552" y="-2" fill="${grey}" font-size="19" font-weight="700" text-anchor="end">${
        esc(this.name)
      }</text>` +
      `<text x="552" y="20" fill="${grey}" font-size="13" text-anchor="end">The Isle: Evrima${
        this.version
          ? ` <tspan font-family="${mono}">${esc(this.version)}</tspan>`
          : ""
      }</text></g></g><path fill="#4f6d8f" d="M0 284h600v16H0z"/></svg>`;
  }

  private get game(): string {
    return this.version
      ? `The Isle: Evrima server ${this.version}`
      : "The Isle: Evrima";
  }

  private membersOf(c: Cls): Members {
    return this.members.get(c.i) ?? { f: [], m: [] };
  }

  private hex(n: number): string {
    return `0x${n.toString(16).toUpperCase()}`;
  }

  private link(c: Cls): string {
    return `<a class="${LINK}" href="${esc(classUrl(c.path))}">${
      esc(c.name)
    }</a>`;
  }

  private tstr(d: TypeDesc): string {
    if (typeof d === "string") return esc(d);
    switch (d[0]) {
      case "a":
      case "S": {
        const inner = d[1] ? this.tstr(d[1]) : "?";
        return `${d[0] === "a" ? "TArray" : "TSet"}&lt;${inner}&gt;`;
      }
      case "k": {
        const c = this.classes[d[1]];
        return `TSubclassOf&lt;${c ? this.link(c) : "UObject"}&gt;`;
      }
      case "o": {
        const c = this.classes[d[1]];
        return `${c ? this.link(c) : "UObject"}*`;
      }
      case "s": {
        const c = this.classes[d[1]];
        return c ? this.link(c) : "struct";
      }
    }
  }

  private inherited(ancestors: Cls[]): string {
    let h = "";
    for (const a of ancestors) {
      const mm = this.membersOf(a);
      if (!mm.f.length && !mm.m.length) continue;
      const names = (list: { 0: string }[], suffix: string) =>
        list
          .map((x) =>
            `<a href="${esc(classUrl(a.path, x[0] + suffix))}">${esc(x[0])}</a>`
          )
          .join(", ");
      h +=
        `<details class="my-2 text-sm"><summary class="cursor-pointer font-semibold ${FOCUS}">Inherited from ${
          esc(a.name)
        } (${mm.f.length} fields, ${mm.m.length} methods)</summary>` +
        (mm.f.length
          ? `<p class="wrap-anywhere my-1.5 ml-3.5 font-mono"><b>Fields:</b> ${
            names(mm.f, "")
          }</p>`
          : "") +
        (mm.m.length
          ? `<p class="wrap-anywhere my-1.5 ml-3.5 font-mono"><b>Methods:</b> ${
            names(mm.m, "()")
          }</p>`
          : "") +
        "</details>";
    }
    return h
      ? `<h2 class="${HEADING}">Inherited members</h2><div class="${BOX} px-2.5 py-1.5 ${LINKS}">${h}</div>`
      : "";
  }
}
