// NoCOMgame server
// - Serves the static client from /public (and three.js from node_modules)
// - Runs a WebSocket relay grouped into "rooms" identified by a 4-digit code
//
// Anyone on the same LAN opens http://<host-ip>:<port>, then hosts or joins a room.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

// URL prefix -> directory on disk
const STATIC_MOUNTS = [
  { prefix: '/vendor/three/', dir: path.join(ROOT, 'node_modules', 'three') },
  { prefix: '/', dir: path.join(ROOT, 'public') },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.gltf']);
const gzipCache = new Map(); // file -> { etag, body }

function resolveStatic(urlPath) {
  for (const { prefix, dir } of STATIC_MOUNTS) {
    if (!urlPath.startsWith(prefix)) continue;
    let rel = decodeURIComponent(urlPath.slice(prefix.length));
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const full = path.resolve(dir, rel);
    // Block path traversal outside the mount
    if (full !== dir && !full.startsWith(dir + path.sep)) return null;
    return full;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const urlPath = new URL(req.url, 'http://localhost').pathname;
  let file;
  try {
    file = resolveStatic(urlPath);
  } catch {
    file = null;
  }
  if (!file) {
    res.writeHead(400).end('Bad request');
    return;
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    // The browser keeps its copy and just asks "changed?" (a tiny 304 answer) on the next load
    const etag = `"${stat.size.toString(36)}-${Math.round(stat.mtimeMs).toString(36)}"`;
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ETag: etag,
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers).end();
      return;
    }
    // Text files go out gzipped (about 4x smaller: matters on wifi). Zipped once, then remembered.
    const wantsGzip = COMPRESSIBLE.has(ext) && String(req.headers['accept-encoding'] || '').includes('gzip');
    if (!wantsGzip) {
      res.writeHead(200, headers);
      fs.createReadStream(file).pipe(res);
      return;
    }
    const hit = gzipCache.get(file);
    if (hit && hit.etag === etag) {
      res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' }).end(hit.body);
      return;
    }
    fs.readFile(file, (readErr, data) => {
      if (readErr) {
        res.writeHead(500).end('Read error');
        return;
      }
      zlib.gzip(data, (zipErr, body) => {
        if (zipErr) {
          res.writeHead(200, headers).end(data);
          return;
        }
        gzipCache.set(file, { etag, body });
        res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' }).end(body);
      });
    });
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new RoomManager();

wss.on('connection', (ws) => rooms.handleConnection(ws));

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  NoCOMgame server running\n');
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  LAN:     http://${ip}:${PORT}`);
  console.log('\n  Share a LAN address with friends, then host/join with a 4-digit code.\n');
});

function lanAddresses() {
  const out = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}
