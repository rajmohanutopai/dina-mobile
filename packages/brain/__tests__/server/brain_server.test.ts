/**
 * T3.1 — Brain HTTP server: health, classify, enrich, reason, process.
 *
 * Source: ARCHITECTURE.md Task 3.1
 */

import request from 'supertest';
import { createBrainApp, resetBrainAuth, configureBrainAuth } from '../../src/server/brain_server';
import type { Request, Response, NextFunction } from 'express';

describe('Brain HTTP Server', () => {
  let app: ReturnType<typeof createBrainApp>;

  beforeEach(() => {
    resetBrainAuth();
    app = createBrainApp();
  });

  describe('GET /healthz — health check', () => {
    it('returns 200 with service=brain', async () => {
      const res = await request(app).get('/healthz');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('brain');
      expect(res.body.timestamp).toBeTruthy();
    });

    it('does not require auth', async () => {
      configureBrainAuth((_req: Request, res: Response, _next: NextFunction) => {
        res.status(401).json({ error: 'unauthorized' });
      });
      app = createBrainApp();

      const res = await request(app).get('/healthz');
      expect(res.status).toBe(200);
    });
  });

  describe('auth middleware', () => {
    it('blocks non-health routes when auth is configured and rejects', async () => {
      configureBrainAuth((_req: Request, res: Response, _next: NextFunction) => {
        res.status(401).json({ error: 'unauthorized' });
      });
      app = createBrainApp();

      const res = await request(app)
        .post('/v1/reason')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(JSON.stringify({ query: 'test' })));
      expect(res.status).toBe(401);
    });

    it('allows requests when auth passes', async () => {
      configureBrainAuth((_req: Request, _res: Response, next: NextFunction) => {
        next();
      });
      app = createBrainApp();

      const res = await request(app)
        .post('/v1/reason')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(JSON.stringify({ query: 'test' })));
      expect(res.status).toBe(200);
    });
  });

  describe('POST /v1/reason — chat reasoning', () => {
    it('returns placeholder response with query echoed', async () => {
      const res = await request(app)
        .post('/v1/reason')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(JSON.stringify({ query: 'What is 2+2?' })));
      expect(res.status).toBe(200);
      expect(res.body.answer).toContain('What is 2+2?');
      expect(res.body.sources).toEqual([]);
      expect(res.body.persona).toBe('general');
    });

    it('accepts custom persona', async () => {
      const res = await request(app)
        .post('/v1/reason')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(JSON.stringify({ query: 'test', persona: 'work' })));
      expect(res.body.persona).toBe('work');
    });

    it('rejects missing query', async () => {
      const res = await request(app)
        .post('/v1/reason')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(JSON.stringify({})));
      expect(res.status).toBe(400);
    });
  });

  describe('POST /v1/process — event processing', () => {
    it('processes an event', async () => {
      const res = await request(app)
        .post('/v1/process')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(JSON.stringify({ event: 'reminder_fired', data: {} })));
      expect(res.status).toBe(200);
      expect(res.body.processed).toBe(true);
      expect(res.body.event).toBe('reminder_fired');
    });

    it('rejects missing event', async () => {
      const res = await request(app)
        .post('/v1/process')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(JSON.stringify({})));
      expect(res.status).toBe(400);
    });
  });

  describe('POST /v1/classify — domain classification', () => {
    it('classifies health-related text', async () => {
      const res = await request(app)
        .post('/v1/classify')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(JSON.stringify({ text: 'Patient diagnosis report for diabetes treatment' })));
      expect(res.status).toBe(200);
      expect(res.body.persona).toBe('health');
      expect(res.body.confidence).toBeGreaterThan(0);
    });

    it('classifies financial text', async () => {
      const res = await request(app)
        .post('/v1/classify')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(JSON.stringify({ text: 'Q4 revenue report and budget forecast' })));
      expect(res.status).toBe(200);
      expect(res.body.persona).toBe('financial');
    });

    it('defaults to general for ambiguous text', async () => {
      const res = await request(app)
        .post('/v1/classify')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(JSON.stringify({ text: 'Hello world' })));
      expect(res.body.persona).toBe('general');
    });

    it('rejects missing text', async () => {
      const res = await request(app)
        .post('/v1/classify')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(JSON.stringify({})));
      expect(res.status).toBe(400);
    });
  });

  describe('POST /v1/enrich — item enrichment', () => {
    it('returns L0 summary for a note', async () => {
      const res = await request(app)
        .post('/v1/enrich')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(JSON.stringify({ summary: 'Meeting with Alice about project timeline', type: 'note' })));
      expect(res.status).toBe(200);
      expect(res.body.content_l0).toBeTruthy();
      expect(res.body.type).toBe('note');
    });

    it('rejects missing summary', async () => {
      const res = await request(app)
        .post('/v1/enrich')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(JSON.stringify({})));
      expect(res.status).toBe(400);
    });
  });
});
