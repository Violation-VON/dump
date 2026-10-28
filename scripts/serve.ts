const base = `${(Deno.env.get("BASE_PATH") ?? "").replace(/\/+$/, "")}/`;
const port = Number(Deno.env.get("PORT")) || 8080;

const types: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
};

async function serveFile(rel: string, status = 200): Promise<Response> {
  if (rel.split("/").includes("..")) throw new Error("outside dist");
  const body = await Deno.readFile(`dist/${rel}`);
  const type = types[rel.slice(rel.lastIndexOf(".") + 1)] ??
    "application/octet-stream";
  return new Response(body, { status, headers: { "content-type": type } });
}

Deno.serve({
  port,
  onListen: ({ port }) => console.log(`http://localhost:${port}${base}`),
}, async (req) => {
  const { pathname } = new URL(req.url);
  try {
    if (!pathname.startsWith(base)) throw new Error("outside base");
    return await serveFile(
      decodeURIComponent(pathname.slice(base.length)) || "index.html",
    );
  } catch {
    return serveFile("404.html", 404);
  }
});
