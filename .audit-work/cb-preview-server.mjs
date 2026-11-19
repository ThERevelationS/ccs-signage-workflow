import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';

const root = resolve('../ccs-cb-import/dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:4175');
    if (url.pathname.startsWith('/api/')) {
      const headers = { ...req.headers };
      delete headers.host;
      delete headers.connection;
      const init = { method: req.method, headers, redirect: 'manual' };
      if (!['GET', 'HEAD'].includes(req.method)) { init.body = req; init.duplex = 'half'; }
      const upstream = await fetch(`https://base44.app${url.pathname}${url.search}`, init);
      const outHeaders = Object.fromEntries(upstream.headers);
      delete outHeaders['content-length'];
      delete outHeaders['content-encoding'];
      delete outHeaders['transfer-encoding'];
      res.writeHead(upstream.status, outHeaders);
      if (upstream.body) Readable.fromWeb(upstream.body).pipe(res); else res.end();
      return;
    }
    let path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (path !== root && !path.startsWith(`${root}${sep}`)) { res.writeHead(403).end(); return; }
    try { if (!(await stat(path)).isFile()) throw new Error('not file'); }
    catch { path = resolve(root, 'index.html'); }
    const content = await readFile(path);
    res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(502).end('Preview request failed.');
  }
}).listen(4175, '127.0.0.1', () => console.log('Preview listening on 127.0.0.1:4175'));
