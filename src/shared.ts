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

export const classUrl = (path: string, id?: string) =>
  `${ePath(path.replace(/\.(?=[^.]*$)/, "/"))}${
    id ? `#${encodeURIComponent(id)}` : ""
  }`;

export const pkgUrl = (p: string) => ePath(p);
