const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

export const esc = (s: unknown) =>
  String(s).replace(/[&<>"]/g, (c) => ESCAPES[c]);

const ePath = (p: string) =>
  encodeURI(p).replace(/[#?]/g, encodeURIComponent).replace(/^\//, "");

export const typeUrl = (path: string, id?: string) =>
  `${ePath(path.replace(/\.(?=[^.]*$)/, "/"))}${
    id ? `#${encodeURIComponent(id)}` : ""
  }`;

export const pkgUrl = (p: string) => ePath(p);

export const isNative = (path: string) => path.startsWith("/Script/");

export const collator = new Intl.Collator("en");
