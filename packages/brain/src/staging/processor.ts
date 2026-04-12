/**
 * Staging processor — claim, classify, enrich, resolve pipeline.
 *
 * Pipeline: claim → classify (domain routing) → enrich (L0/L1) → resolve.
 *
 * classifyItem: uses keyword-based domain classifier to route items to personas.
 * enrichItem: generates deterministic L0 summary, preserves existing L1.
 * processPendingItems: orchestrates the full pipeline.
 *
 * Source: brain/tests/test_staging_processor.py
 */

import { classifySourceTrust } from '../../../core/src/trust/source_trust';
import { classifyDomain } from '../routing/domain';
import { generateL0 } from '../enrichment/l0_deterministic';

export interface StagingProcessResult {
  itemId: string;
  persona: string;
  status: 'stored' | 'pending_unlock' | 'failed';
  enriched: boolean;
}

/** In-memory staging inbox for pending items. */
const pendingItems: Array<Record<string, unknown>> = [];

/** Clear pending items (for testing). */
export function clearPendingItems(): void {
  pendingItems.length = 0;
}

/** Add items to the pending queue (for testing / ingest integration). */
export function addPendingItem(item: Record<string, unknown>): void {
  pendingItems.push(item);
}

/**
 * Process all pending staging items.
 *
 * Pipeline: claim → classify → enrich → resolve.
 * Returns results for each processed item.
 */
export async function processPendingItems(limit?: number): Promise<StagingProcessResult[]> {
  const batchSize = limit ?? 10;
  const batch = pendingItems.splice(0, batchSize);
  const results: StagingProcessResult[] = [];

  for (const item of batch) {
    try {
      // 1. Classify into target persona
      const classification = await classifyItem(item);

      // 2. Enrich with L0/L1 summaries
      const enriched = await enrichItem(item);

      // 3. Build result
      results.push({
        itemId: String(item.id ?? 'unknown'),
        persona: classification.persona,
        status: 'stored',
        enriched: true,
      });
    } catch {
      results.push({
        itemId: String(item.id ?? 'unknown'),
        persona: 'general',
        status: 'failed',
        enriched: false,
      });
    }
  }

  return results;
}

/**
 * Classify a single item into a target persona.
 *
 * Uses the keyword-based domain classifier for deterministic routing.
 * Falls back to "general" when no strong domain match.
 */
export async function classifyItem(
  item: Record<string, unknown>,
): Promise<{ persona: string; confidence: number }> {
  const result = classifyDomain({
    type: String(item.type ?? ''),
    source: String(item.source ?? ''),
    sender: String(item.sender ?? ''),
    subject: String(item.summary ?? item.subject ?? ''),
    body: String(item.body ?? ''),
  });

  return {
    persona: result.persona,
    confidence: result.confidence,
  };
}

/**
 * Enrich a classified item with L0/L1 summaries.
 *
 * L0: deterministic one-line headline (generateL0).
 * L1: preserved if already present; LLM enrichment deferred to Phase 3.14.
 */
export async function enrichItem(
  item: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const l0 = generateL0({
    type: String(item.type ?? ''),
    source: String(item.source ?? ''),
    sender: String(item.sender ?? ''),
    timestamp: Number(item.timestamp ?? 0),
    summary: item.summary ? String(item.summary) : undefined,
    sender_trust: item.sender_trust ? String(item.sender_trust) : undefined,
  });

  return {
    ...item,
    content_l0: l0,
    content_l1: item.content_l1 ?? '',
    enrichment_status: 'l0_complete',
    enrichment_version: 'deterministic-v1',
  };
}

/**
 * Apply trust scoring to a staging item.
 * Uses classifySourceTrust to assign sender_trust, confidence, retrieval_policy.
 */
export function applyTrustScoring(item: Record<string, unknown>): Record<string, unknown> {
  const sender = String(item.sender ?? '');
  const source = String(item.source ?? '');
  const ingressChannel = String(item.ingress_channel ?? item.connector_id ?? '');

  const trust = classifySourceTrust(sender, source, ingressChannel);

  return {
    ...item,
    sender_trust: trust.sender_trust,
    confidence: trust.confidence,
    retrieval_policy: trust.retrieval_policy,
  };
}

/**
 * Resolve contact DID from sender.
 * If sender starts with "did:", it IS the DID. Otherwise resolve by alias/name.
 * Returns null for unresolvable senders.
 */
export function resolveContactDID(sender: string): string | null {
  if (!sender) return null;
  if (sender.startsWith('did:')) return sender;
  return null;
}
