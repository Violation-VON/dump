const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

export const esc = (s: unknown) =>
  String(s).replace(/[&<>"]/g, (c) => ESCAPES[c]);

const ePath = (p: string) => encodeURI(p).replace(/[#?]/g, encodeURIComponent);

export const classUrl = (path: string, id?: string) =>
  `c${ePath(path)}${id ? `#${encodeURIComponent(id)}` : ""}`;

export const pkgUrl = (p: string) => `p${ePath(p)}`;
