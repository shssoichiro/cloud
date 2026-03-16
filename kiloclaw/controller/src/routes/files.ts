import type { Hono } from 'hono';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getBearerToken } from './gateway';
import { timingSafeTokenEqual } from '../auth';
import { resolveSafePath, verifyCanonicalized, SafePathError } from '../safe-path';
import { atomicWrite } from '../atomic-write';
import { backupFile } from '../backup-file';

const ALLOWED_EXTENSIONS = new Set(['.json', '.json5', '.md', '.txt', '.yaml', '.yml', '.toml']);
const FILTERED_PATTERNS = [/\.bak\./, /\.kilotmp\./];
const FILTERED_DIRS = new Set(['credentials']);

function computeEtag(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

function isAllowedExtension(filePath: string): boolean {
  return ALLOWED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isFiltered(name: string): boolean {
  return FILTERED_PATTERNS.some(p => p.test(name));
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

function buildTree(dir: string, rootDir: string): FileNode[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (isFiltered(entry.name)) continue;
    if (FILTERED_DIRS.has(entry.name) && entry.isDirectory()) continue;
    if (entry.isSymbolicLink()) continue;

    const relativePath = path.relative(rootDir, path.join(dir, entry.name));

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'directory',
        children: buildTree(path.join(dir, entry.name), rootDir),
      });
    } else {
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'file',
      });
    }
  }

  return nodes;
}

export function registerFileRoutes(app: Hono, expectedToken: string, rootDir: string): void {
  app.use('/_kilo/files/*', async (c, next) => {
    const token = getBearerToken(c.req.header('authorization'));
    if (!timingSafeTokenEqual(token, expectedToken)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
  });

  app.get('/_kilo/files/tree', c => {
    const tree = buildTree(rootDir, rootDir);
    return c.json({ tree });
  });

  app.get('/_kilo/files/read', c => {
    const relativePath = c.req.query('path');
    if (!relativePath) {
      return c.json({ error: 'Missing path parameter' }, 400);
    }

    if (!isAllowedExtension(relativePath)) {
      return c.json({ error: 'File type not allowed' }, 400);
    }

    let resolved: string;
    try {
      resolved = resolveSafePath(relativePath, rootDir);
    } catch (e) {
      if (e instanceof SafePathError) {
        return c.json({ error: e.message }, 400);
      }
      throw e;
    }

    if (!fs.existsSync(resolved)) {
      return c.json({ code: 'file_not_found', error: 'File does not exist' }, 404);
    }

    // Canonicalize to catch symlinked ancestors escaping the root
    try {
      verifyCanonicalized(fs.realpathSync(resolved), rootDir);
    } catch (e) {
      if (e instanceof SafePathError) {
        return c.json({ error: e.message }, 400);
      }
      throw e;
    }

    const stat = fs.lstatSync(resolved);
    if (stat.isSymbolicLink()) {
      return c.json({ error: 'Symlinks are not allowed' }, 400);
    }
    if (!stat.isFile()) {
      return c.json({ error: 'Not a regular file' }, 400);
    }

    const content = fs.readFileSync(resolved, 'utf-8');
    return c.json({ content, etag: computeEtag(content) });
  });

  app.post('/_kilo/files/write', async c => {
    const body = await c.req.json<{ path: string; content: string; etag?: string }>();

    if (!body.path || typeof body.content !== 'string') {
      return c.json({ error: 'Missing path or content' }, 400);
    }

    if (!isAllowedExtension(body.path)) {
      return c.json({ error: 'File type not allowed' }, 400);
    }

    let resolved: string;
    try {
      resolved = resolveSafePath(body.path, rootDir);
    } catch (e) {
      if (e instanceof SafePathError) {
        return c.json({ error: e.message }, 400);
      }
      throw e;
    }

    if (!fs.existsSync(resolved)) {
      return c.json({ code: 'file_not_found', error: 'File does not exist' }, 404);
    }

    // Canonicalize to catch symlinked ancestors escaping the root
    try {
      verifyCanonicalized(fs.realpathSync(resolved), rootDir);
    } catch (e) {
      if (e instanceof SafePathError) {
        return c.json({ error: e.message }, 400);
      }
      throw e;
    }

    const stat = fs.lstatSync(resolved);
    if (stat.isSymbolicLink()) {
      return c.json({ error: 'Symlinks are not allowed' }, 400);
    }
    if (!stat.isFile()) {
      return c.json({ error: 'Not a regular file' }, 400);
    }

    if (body.etag) {
      const currentContent = fs.readFileSync(resolved, 'utf-8');
      const currentEtag = computeEtag(currentContent);
      if (body.etag !== currentEtag) {
        return c.json({ code: 'file_etag_conflict', error: 'File was modified externally' }, 409);
      }
    }

    backupFile(resolved);
    atomicWrite(resolved, body.content);

    const newEtag = computeEtag(body.content);
    return c.json({ etag: newEtag });
  });
}
