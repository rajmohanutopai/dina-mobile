/**
 * User-facing API endpoints — async ask + remember with polling.
 *
 * POST /api/v1/ask              → submit a question (returns job ID)
 * GET  /api/v1/ask/:id/status   → poll job status + result
 * POST /api/v1/remember         → submit something to remember (returns job ID)
 * GET  /api/v1/remember/:id     → poll remember job status
 *
 * Both /ask and /remember are async: the POST creates a job and returns
 * immediately with a job ID. The client polls the status endpoint until
 * the job completes (status: processing → completed | failed).
 *
 * Source: ARCHITECTURE.md Task 2.80
 */

import { Router, type Request, type Response } from 'express';

export type JobStatus = 'processing' | 'completed' | 'failed';
export type JobKind = 'ask' | 'remember';

export interface Job {
  id: string;
  kind: JobKind;
  status: JobStatus;
  input: string;
  persona: string;
  result?: string;
  sources?: string[];
  error?: string;
  created_at: number;
  completed_at?: number;
}

/** In-memory job store. */
const jobs = new Map<string, Job>();
let jobCounter = 0;

/** Injectable ask handler — in production, calls Brain reasoning pipeline. */
let askHandler: ((query: string, persona: string) => Promise<{ answer: string; sources: string[] }>) | null = null;

/** Injectable remember handler — in production, calls staging ingest. */
let rememberHandler: ((text: string, persona: string) => Promise<{ id: string; duplicate: boolean }>) | null = null;

/** Register the ask handler. */
export function setAskHandler(handler: (query: string, persona: string) => Promise<{ answer: string; sources: string[] }>): void {
  askHandler = handler;
}

/** Register the remember handler. */
export function setRememberHandler(handler: (text: string, persona: string) => Promise<{ id: string; duplicate: boolean }>): void {
  rememberHandler = handler;
}

/** Get a job by ID (for testing). */
export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

/** Reset all state (for testing). */
export function resetUserApiState(): void {
  jobs.clear();
  jobCounter = 0;
  askHandler = null;
  rememberHandler = null;
}

export function createUserApiRouter(): Router {
  const router = Router();

  // POST /api/v1/ask — submit a question
  router.post('/api/v1/ask', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const query = String(body.query ?? '');
      const persona = String(body.persona ?? 'general');

      if (!query) { res.status(400).json({ error: 'query is required' }); return; }

      const job = createJob('ask', query, persona);

      // Defer processing to next tick so the 202 response goes out first
      setImmediate(() => processAsk(job.id, query, persona));

      res.status(202).json({ id: job.id, status: 'processing' });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/v1/ask/:id/status — poll ask job
  router.get('/api/v1/ask/:id/status', (req: Request, res: Response) => {
    const job = jobs.get(String(req.params.id));
    if (!job || job.kind !== 'ask') {
      res.status(404).json({ error: 'Ask job not found' });
      return;
    }

    const response: Record<string, unknown> = {
      id: job.id, status: job.status, persona: job.persona,
    };

    if (job.status === 'completed') {
      response.result = job.result;
      response.sources = job.sources;
      response.completed_at = job.completed_at;
    } else if (job.status === 'failed') {
      response.error = job.error;
    }

    res.json(response);
  });

  // POST /api/v1/remember — submit something to remember
  router.post('/api/v1/remember', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const text = String(body.text ?? '');
      const persona = String(body.persona ?? 'general');

      if (!text) { res.status(400).json({ error: 'text is required' }); return; }

      const job = createJob('remember', text, persona);

      // Defer processing to next tick so the 202 response goes out first
      setImmediate(() => processRemember(job.id, text, persona));

      res.status(202).json({ id: job.id, status: 'processing' });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/v1/remember/:id — poll remember job
  router.get('/api/v1/remember/:id', (req: Request, res: Response) => {
    const job = jobs.get(String(req.params.id));
    if (!job || job.kind !== 'remember') {
      res.status(404).json({ error: 'Remember job not found' });
      return;
    }

    const response: Record<string, unknown> = {
      id: job.id, status: job.status, persona: job.persona,
    };

    if (job.status === 'completed') {
      response.result = job.result;
      response.completed_at = job.completed_at;
    } else if (job.status === 'failed') {
      response.error = job.error;
    }

    res.json(response);
  });

  return router;
}

function createJob(kind: JobKind, input: string, persona: string): Job {
  jobCounter++;
  const job: Job = {
    id: `job-${kind}-${jobCounter}`,
    kind,
    status: 'processing',
    input,
    persona,
    created_at: Date.now(),
  };
  jobs.set(job.id, job);
  return job;
}

async function processAsk(jobId: string, query: string, persona: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  try {
    if (askHandler) {
      const result = await askHandler(query, persona);
      job.result = result.answer;
      job.sources = result.sources;
      job.status = 'completed';
      job.completed_at = Date.now();
    } else {
      job.status = 'failed';
      job.error = 'Reasoning pipeline not configured';
    }
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
  }
}

async function processRemember(jobId: string, text: string, persona: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  try {
    if (rememberHandler) {
      const result = await rememberHandler(text, persona);
      job.result = result.duplicate ? 'Already stored' : 'Stored successfully';
      job.status = 'completed';
      job.completed_at = Date.now();
    } else {
      job.status = 'failed';
      job.error = 'Storage pipeline not configured';
    }
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
  }
}

function parseJSON(req: Request): Record<string, unknown> {
  const raw = req.body instanceof Buffer ? req.body.toString('utf-8') : '';
  return raw ? JSON.parse(raw) : {};
}
