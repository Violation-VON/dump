const ENDPOINT = "https://api.indexnow.org/IndexNow";
const LIMIT = 10_000;
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
};

const locs = (xml: string) =>
  Array.from(
    xml.matchAll(/<loc>([^<]*)<\/loc>/g),
    (m) => m[1].replace(/&(?:amp|lt|gt|quot);/g, (e) => ENTITIES[e]),
  );

async function submit() {
  const key = Deno.env.get("INDEXNOW_KEY");
  if (!key) {
    console.log("IndexNow skipped: INDEXNOW_KEY is not set");
    return;
  }
  const urls: string[] = [];
  const index = await Deno.readTextFile("dist/sitemap.xml");
  for (const loc of locs(index)) {
    const name = loc.slice(loc.lastIndexOf("/") + 1);
    for (const url of locs(await Deno.readTextFile(`dist/${name}`))) {
      urls.push(url);
    }
  }
  if (!urls.length) return;

  const { host, origin } = new URL(urls[0]);
  const parts = Math.ceil(urls.length / LIMIT);
  const size = Math.ceil(urls.length / parts);
  for (let i = 0; i < urls.length; i += size) {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `${origin}/${key}.txt`,
        urlList: urls.slice(i, i + size),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  }
  console.log(`Submitted ${urls.length.toLocaleString()} URLs to IndexNow`);
}

if (Deno.env.get("VERCEL_ENV") === "production") {
  try {
    await submit();
  } catch (e) {
    console.warn(`IndexNow submission failed: ${e}`);
  }
}
