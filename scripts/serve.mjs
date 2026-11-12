#!/usr/bin/env node
/**
 * Tiny zero-dependency static server for the demos.
 * ES modules need http://, not file://, so `npm start` exists.
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.cwd());
const port = Number(process.env.PORT ?? 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/examples/index.html';

  const target = resolve(join(root, normalize(pathname)));
  if (target !== root && !target.startsWith(root + sep)) {
    response.writeHead(403, { 'content-type': 'text/plain' }).end('Forbidden');
    return;
  }

  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      response.writeHead(302, { location: `${pathname.replace(/\/?$/, '/')}index.html` }).end();
      return;
    }
    response.writeHead(200, {
      'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(port, () => {
  process.stdout.write(`tabloom demos: http://localhost:${port}/\n`);
});
