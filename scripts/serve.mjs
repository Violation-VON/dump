import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const base = `${(process.env.BASE_PATH || '').replace(/\/+$/, '')}/`;
const port = Number(process.env.PORT) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
};

async function read(rel) {
  const file = normalize(join(dist, rel || 'index.html'));
  if (!file.startsWith(dist)) throw new Error('outside');
  return { file, body: await readFile(file) };
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (!pathname.startsWith(base)) throw new Error('outside base');
    const { file, body } = await read(decodeURIComponent(pathname.slice(base.length)));
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    const { body } = await read('404.html');
    res.writeHead(404, { 'content-type': types['.html'] });
    res.end(body);
  }
}).listen(port, () => console.log(`http://localhost:${port}${base}`));
