/**
 * Vault HTTP endpoints — CRUD for vault items and KV store.
 *
 * POST /v1/vault/query       → FTS keyword search
 * POST /v1/vault/store       → store single item
 * POST /v1/vault/store/batch → store up to 100 items
 * GET  /v1/vault/item/:id    → get item by ID
 * GET  /v1/vault/kv/:key     → get KV value
 * PUT  /v1/vault/kv/:key     → set KV value
 *
 * Source: ARCHITECTURE.md Task 2.70
 */

import { Router, type Request, type Response } from 'express';
import { storeItem, storeBatch, queryVault, getItem, deleteItem } from '../../vault/crud';
import { kvGet, kvSet, kvDelete } from '../../kv/store';

export function createVaultRouter(): Router {
  const router = Router();

  // POST /v1/vault/query — FTS keyword search
  router.post('/v1/vault/query', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const persona = (req.query.persona as string) || 'general';
      const text = String(body.text ?? '');
      const mode = (body.mode as 'fts5' | 'semantic' | 'hybrid') ?? 'fts5';
      const limit = Math.max(1, Math.min(Number(body.limit) || 20, 100));

      const results = queryVault(persona, { mode, text, limit });
      res.json({ items: results, count: results.length });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  // POST /v1/vault/store — store single item
  router.post('/v1/vault/store', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const persona = (req.query.persona as string) || 'general';
      const id = storeItem(persona, body);
      res.status(201).json({ id });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  // POST /v1/vault/store/batch — store up to 100 items
  router.post('/v1/vault/store/batch', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const persona = (req.query.persona as string) || 'general';
      if (!Array.isArray(body.items)) {
        res.status(400).json({ error: 'items must be an array' });
        return;
      }
      const ids = storeBatch(persona, body.items);
      res.status(201).json({ ids, count: ids.length });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  // GET /v1/vault/item/:id — get item by ID
  router.get('/v1/vault/item/:id', (req: Request, res: Response) => {
    const persona = (req.query.persona as string) || 'general';
    const item = getItem(persona, String(req.params.id));
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    res.json(item);
  });

  // DELETE /v1/vault/item/:id — soft delete
  router.delete('/v1/vault/item/:id', (req: Request, res: Response) => {
    const persona = (req.query.persona as string) || 'general';
    const deleted = deleteItem(persona, String(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    res.json({ deleted: true });
  });

  // GET /v1/vault/kv/:key — get KV value
  router.get('/v1/vault/kv/:key', (req: Request, res: Response) => {
    const ns = req.query.namespace as string | undefined;
    const value = kvGet(String(req.params.key), ns);
    if (value === null) {
      res.status(404).json({ error: 'Key not found' });
      return;
    }
    res.json({ key: String(req.params.key), value });
  });

  // PUT /v1/vault/kv/:key — set KV value
  router.put('/v1/vault/kv/:key', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const ns = req.query.namespace as string | undefined;
      kvSet(String(req.params.key), String(body.value ?? ''), ns);
      res.json({ key: String(req.params.key), stored: true });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  // DELETE /v1/vault/kv/:key
  router.delete('/v1/vault/kv/:key', (req: Request, res: Response) => {
    const ns = req.query.namespace as string | undefined;
    kvDelete(String(req.params.key), ns);
    res.json({ deleted: true });
  });

  return router;
}

function parseJSON(req: Request): Record<string, unknown> {
  const raw = req.body instanceof Buffer ? req.body.toString('utf-8') : '';
  return raw ? JSON.parse(raw) : {};
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
