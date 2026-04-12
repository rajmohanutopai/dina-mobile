/**
 * Chat reasoning pipeline — vault-grounded question answering.
 *
 * Full pipeline:
 *   1. assembleContext — search vault across accessible personas
 *   2. checkCloudGate — PII scrub if sensitive persona + cloud LLM
 *   3. LLM reasoning — answer the question using scrubbed context
 *   4. scanResponse + stripViolations — guard scan the answer
 *   5. rehydrateResponse — restore PII tokens in the final answer
 *
 * This is the integration point of nearly every Brain module.
 *
 * Source: ARCHITECTURE.md Task 3.25
 */

import { assembleContext, type AssembledContext } from '../vault_context/assembly';
import { checkCloudGate, rehydrateResponse } from '../llm/cloud_gate';
import { scanResponse, stripViolations } from '../guardian/guard_scan';

export interface ReasoningRequest {
  query: string;
  persona: string;
  provider: string;       // 'claude' | 'openai' | 'local' | 'none'
  maxTokens?: number;
}

export interface ReasoningResult {
  answer: string;
  sources: string[];
  persona: string;
  scrubbed: boolean;
  guardViolations: number;
  stripped: boolean;
}

/** Injectable LLM reasoning function. */
export type ReasoningLLM = (query: string, context: string) => Promise<string>;

let reasoningLLM: ReasoningLLM | null = null;

/** Register the reasoning LLM. */
export function registerReasoningLLM(llm: ReasoningLLM): void {
  reasoningLLM = llm;
}

/** Reset (for testing). */
export function resetReasoningLLM(): void {
  reasoningLLM = null;
}

/**
 * Run the full chat reasoning pipeline.
 *
 * Returns a vault-grounded, PII-safe, guard-scanned answer.
 */
export async function reason(req: ReasoningRequest): Promise<ReasoningResult> {
  // 1. Assemble vault context
  const context = await assembleContext(req.query, req.maxTokens);
  const sources = context.items.map(item => item.id);

  // No context → short-circuit
  if (context.items.length === 0 && !reasoningLLM) {
    return {
      answer: 'I don\'t have any relevant information about that in my memory.',
      sources: [],
      persona: req.persona,
      scrubbed: false,
      guardViolations: 0,
      stripped: false,
    };
  }

  // 2. Build context text for LLM
  const contextText = formatContextForLLM(context);
  const fullPrompt = `Context:\n${contextText}\n\nQuestion: ${req.query}`;

  // 3. Cloud gate — PII scrub if needed
  const gate = checkCloudGate(fullPrompt, req.persona, req.provider);

  if (!gate.allowed) {
    // Cloud refused — try context-only answer
    return {
      answer: buildContextOnlyAnswer(context),
      sources,
      persona: req.persona,
      scrubbed: false,
      guardViolations: 0,
      stripped: false,
    };
  }

  // 4. LLM reasoning
  let rawAnswer: string;
  if (reasoningLLM) {
    rawAnswer = await reasoningLLM(req.query, gate.scrubbedText ?? fullPrompt);
  } else {
    rawAnswer = buildContextOnlyAnswer(context);
  }

  // 5. Guard scan
  const scanResult = scanResponse(rawAnswer, { persona: req.persona, piiScrubbed: gate.scrubbed });
  let finalAnswer = rawAnswer;
  let stripped = false;

  if (scanResult.violations.length > 0) {
    finalAnswer = stripViolations(rawAnswer);
    stripped = true;
  }

  // 6. Rehydrate PII tokens if scrubbed
  if (gate.scrubbed && gate.vault) {
    finalAnswer = rehydrateResponse(finalAnswer, gate.vault);
  }

  return {
    answer: finalAnswer,
    sources,
    persona: req.persona,
    scrubbed: gate.scrubbed,
    guardViolations: scanResult.violations.length,
    stripped,
  };
}

/** Format context items for the LLM prompt. */
function formatContextForLLM(context: AssembledContext): string {
  if (context.items.length === 0) return '(no relevant context found)';

  return context.items.map(item => {
    let text = `[${item.id}] ${item.content_l0}`;
    if (item.content_l1) text += `\n  ${item.content_l1}`;
    if (item.body) text += `\n  ${item.body}`;
    return text;
  }).join('\n');
}

/** Build a context-only answer without LLM. */
function buildContextOnlyAnswer(context: AssembledContext): string {
  if (context.items.length === 0) {
    return 'I don\'t have any relevant information about that in my memory.';
  }

  const summaries = context.items
    .slice(0, 5)
    .map(item => `- ${item.content_l0}`)
    .filter(s => s.length > 2);

  return `Based on my memory:\n${summaries.join('\n')}`;
}
