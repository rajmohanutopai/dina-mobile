/**
 * Brain's HTTP client for calling Core — Ed25519 signed, with retry.
 *
 * Retry: 3x exponential (1s, 2s, 4s). Non-retryable: 401, 403.
 * Timeout: 30s. Request-ID propagation for audit correlation.
 * PII scrub on outbound vault queries.
 *
 * Source: brain/tests/test_core_client.py
 */

import { signRequest } from '../../../core/src/auth/canonical';
import { randomBytes } from '@noble/ciphers/utils.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { isNonRetryableStatus, backoff, parseResponseBody } from '../../../core/src/transport/http_retry';

export interface BrainCoreClientConfig {
  coreURL: string;
  privateKey: Uint8Array;
  did: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof globalThis.fetch;  // injectable for testing
}

export class BrainCoreClient {
  private readonly coreURL: string;
  private readonly privateKey: Uint8Array;
  private readonly did: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: BrainCoreClientConfig) {
    if (!config.coreURL) throw new Error('coreURL is required');
    if (!config.did) throw new Error('did is required');

    this.coreURL = config.coreURL.replace(/\/$/, '');
    this.privateKey = config.privateKey;
    this.did = config.did;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.fetchFn = config.fetch ?? globalThis.fetch;
  }

  /** Read a vault item from Core. */
  async readVaultItem(persona: string, itemId: string): Promise<unknown> {
    const result = await this.signedRequest('GET', `/v1/vault/item/${encodeURIComponent(itemId)}?persona=${encodeURIComponent(persona)}`);
    return result.body;
  }

  /** Write a vault item to Core. */
  async writeVaultItem(persona: string, item: unknown): Promise<string> {
    const result = await this.signedRequest('POST', `/v1/vault/store?persona=${encodeURIComponent(persona)}`, item);
    return (result.body as { id: string }).id;
  }

  /** Search vault via Core. */
  async searchVault(persona: string, query: string, limit?: number): Promise<unknown[]> {
    const body = { text: query, mode: 'fts5', limit: limit ?? 20 };
    const result = await this.signedRequest('POST', `/v1/vault/query?persona=${encodeURIComponent(persona)}`, body);
    return (result.body as { items: unknown[] }).items ?? [];
  }

  /** Write to scratchpad (multi-step reasoning checkpoint). */
  async writeScratchpad(taskId: string, step: number, context: unknown): Promise<void> {
    await this.signedRequest('POST', '/v1/scratchpad', { taskId, step, context });
  }

  /** Read from scratchpad. */
  async readScratchpad(taskId: string): Promise<{ step: number; context: unknown } | null> {
    const result = await this.signedRequest('GET', `/v1/scratchpad/${encodeURIComponent(taskId)}`);
    if (result.status === 404) return null;
    return result.body as { step: number; context: unknown };
  }

  /**
   * Claim staging items from Core for processing.
   *
   * POST /v1/staging/claim?limit=N → atomically moves items
   * from received→classifying with a 15-minute lease.
   */
  async claimStagingItems(limit: number = 10): Promise<unknown[]> {
    const result = await this.signedRequest('POST', `/v1/staging/claim?limit=${limit}`);
    return (result.body as { items: unknown[] }).items ?? [];
  }

  /** Resolve a staging item — store in vault or mark pending_unlock. */
  async resolveStagingItem(itemId: string, persona: string, data: unknown): Promise<unknown> {
    const result = await this.signedRequest('POST', '/v1/staging/resolve', {
      id: itemId, persona, data,
    });
    return result.body;
  }

  /** Fail a staging item — increment retry count. */
  async failStagingItem(itemId: string, reason: string): Promise<void> {
    await this.signedRequest('POST', '/v1/staging/fail', { id: itemId, reason });
  }

  /** Extend the lease on a staging item. */
  async extendStagingLease(itemId: string, seconds: number): Promise<void> {
    await this.signedRequest('POST', '/v1/staging/extend', { id: itemId, seconds });
  }

  /** Send a D2D message via Core. */
  async sendMessage(recipientDID: string, messageType: string, body: unknown): Promise<void> {
    await this.signedRequest('POST', '/v1/msg/send', {
      recipient_did: recipientDID,
      type: messageType,
      body,
    });
  }

  /** PII scrub via Core's Tier 1 scrubber. */
  async piiScrub(text: string): Promise<{ scrubbed: string; entities: unknown[] }> {
    const result = await this.signedRequest('POST', '/v1/pii/scrub', { text });
    return result.body as { scrubbed: string; entities: unknown[] };
  }

  /** Check if Core is reachable. */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.signedRequest('GET', '/healthz');
      return result.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Send a signed request to Core with retry semantics.
   *
   * Signs each attempt fresh (nonce + timestamp must be unique).
   * Retries on 5xx and connection errors. Fails immediately on 401/403.
   */
  private async signedRequest(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: unknown }> {
    const url = `${this.coreURL}${path}`;
    const bodyStr = body !== undefined ? JSON.stringify(body) : '';
    const bodyBytes = new TextEncoder().encode(bodyStr);
    const requestId = `req-${bytesToHex(randomBytes(8))}`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const authHeaders = signRequest(method, path, '', bodyBytes, this.privateKey, this.did);

      const headers: Record<string, string> = {
        ...authHeaders,
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      };

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await this.fetchFn(url, {
          method,
          headers,
          body: bodyStr || undefined,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (isNonRetryableStatus(response.status)) {
          const text = await response.text();
          throw new Error(`BrainCoreClient: HTTP ${response.status} — ${text}`);
        }

        if (response.status >= 500) {
          lastError = new Error(`BrainCoreClient: HTTP ${response.status}`);
          if (attempt < this.maxRetries) {
            await backoff(attempt);
            continue;
          }
          throw lastError;
        }

        const respBody = await parseResponseBody(response);
        return { status: response.status, body: respBody };

      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        // Non-retryable errors (401/403) propagate immediately
        if (error.message.includes('HTTP 401') || error.message.includes('HTTP 403')) {
          throw error;
        }

        lastError = error;

        if (attempt < this.maxRetries) {
          await backoff(attempt);
          continue;
        }
      }
    }

    throw lastError ?? new Error('BrainCoreClient: request failed');
  }

  // parseBody and backoff extracted to core/transport/http_retry.ts
}
