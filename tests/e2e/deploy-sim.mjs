// Simulates a new deploy for the service-worker update test:
//   - buildVersions(): two production builds that differ only in the baked-in
//     build id (so the JS hash, the precache manifest, and sw.js all change);
//   - startServer(): serves one of them, and can switch to the other mid-test,
//     like Cloudflare after a push to main.
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const viteBin = join(root, 'node_modules/vite/bin/vite.js');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

export function buildVersions(baseDir) {
  const out = {};
  for (const [name, sha] of [['v1', 'aaaaaaa'], ['v2', 'bbbbbbb']]) {
    const dir = resolve(root, baseDir, name);
    const r = spawnSync(process.execPath, [viteBin, 'build', '--outDir', dir, '--emptyOutDir', '--logLevel', 'error'], {
      cwd: root,
      env: { ...process.env, WORKERS_CI_COMMIT_SHA: sha },
      encoding: 'utf8',
    });
    if (r.status !== 0) throw new Error(`vite build ${name} failed:\n${r.stderr}`);
    out[name] = dir;
  }
  return out;
}

export async function startServer(dirs, initial = 'v1') {
  let current = initial;
  const server = createServer(async (req, res) => {
    const base = dirs[current];
    let path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
    if (path.endsWith('/') || path === '\\') path = join(path, 'index.html');
    let file = join(base, path);
    try {
      if (!(await stat(file)).isFile()) throw new Error('not a file');
    } catch {
      file = join(base, 'index.html'); // SPA fallback, as on Cloudflare
    }
    const body = await readFile(file);
    // Everything no-cache: what matters is that sw.js is re-fetched.
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    use(version) {
      current = version;
    },
    close: () => new Promise((r) => server.close(r)),
  };
}
