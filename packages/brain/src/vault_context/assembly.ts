/**
 * Vault context assembly — gather relevant items for LLM reasoning.
 *
 * Tool execution: vault search, progressive loading (L0→L1→L2).
 * Reasoning agent: multi-turn tool loop (max 6 turns).
 * User origin propagation: track who initiated the query.
 *
 * Source: brain/tests/test_vault_context.py
 */

import { queryVault, getItem } from '../../../core/src/vault/crud';

export interface ContextItem {
  id: string;
  content_l0: string;
  content_l1?: string;
  body?: string;
  score: number;
  persona: string;
}

export interface AssembledContext {
  items: ContextItem[];
  tokenEstimate: number;
  personas: string[];
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export type ReasoningLLMProvider = (messages: LLMMessage[]) => Promise<LLMMessage>;

/** Maximum reasoning agent turns before forced stop. */
const MAX_REASONING_TURNS = 6;

/** Average tokens per character (rough estimate for context budgeting). */
const TOKENS_PER_CHAR = 0.25;

/** Default token budget when not specified. */
const DEFAULT_MAX_TOKENS = 8000;

/** Personas that are accessible by default. */
let accessiblePersonas: string[] = ['general'];

/** Injectable LLM provider for the reasoning agent. */
let reasoningProvider: ReasoningLLMProvider | null = null;

/** Set accessible personas (for testing / lifecycle integration). */
export function setAccessiblePersonas(personas: string[]): void {
  accessiblePersonas = [...personas];
}

/** Get accessible personas. */
export function getAccessiblePersonas(): string[] {
  return [...accessiblePersonas];
}

/** Register an LLM provider for the reasoning agent. */
export function registerReasoningProvider(provider: ReasoningLLMProvider): void {
  reasoningProvider = provider;
}

/** Reset the reasoning provider (for testing). */
export function resetReasoningProvider(): void {
  reasoningProvider = null;
}

/**
 * Tool declarations for the reasoning agent.
 */
const TOOL_DECLARATIONS: Array<{ name: string; description: string; parameters?: Record<string, unknown> }> = [
  {
    name: 'vault_search',
    description: 'Search the user\'s vault for relevant memories, notes, and stored information. Returns ranked results with progressive detail levels.',
    parameters: { persona: 'string', query: 'string', limit: 'number' },
  },
  {
    name: 'vault_read',
    description: 'Read the full content (L2 body) of a specific vault item by ID. Use after vault_search to get complete details.',
    parameters: { item_id: 'string' },
  },
  {
    name: 'contact_lookup',
    description: 'Look up a contact by name, alias, or DID. Returns contact details, relationship notes, and trust level.',
    parameters: { query: 'string' },
  },
  {
    name: 'reminder_check',
    description: 'Check upcoming reminders and calendar events for a person or topic.',
    parameters: { query: 'string', days_ahead: 'number' },
  },
];

/**
 * Get tool declarations for the reasoning agent.
 */
export function getToolDeclarations(): Array<{ name: string; description: string }> {
  return TOOL_DECLARATIONS.map(({ name, description }) => ({ name, description }));
}

/**
 * Propagate user origin through the reasoning chain.
 */
export function propagateUserOrigin(origin: string): string {
  if (!origin || origin.trim().length === 0) return 'system';
  const trimmed = origin.trim();
  if (trimmed === 'user' || trimmed === 'self' || trimmed === 'owner') return 'user';
  if (trimmed.startsWith('did:')) return trimmed;
  if (trimmed === 'system' || trimmed === 'cron' || trimmed === 'timer' || trimmed === 'sync') return 'system';
  return 'system';
}

/**
 * Execute a vault search tool call.
 */
export async function executeToolSearch(
  persona: string,
  query: string,
  limit?: number,
): Promise<ContextItem[]> {
  const searchLimit = limit ?? 20;
  const results = queryVault(persona, { mode: 'fts5', text: query, limit: searchLimit });

  return results.map((item, index) => ({
    id: item.id,
    content_l0: item.content_l0 || item.summary || '',
    content_l1: index < 5 ? (item.content_l1 || undefined) : undefined,
    body: index < 1 ? (item.body || undefined) : undefined,
    score: 1.0 - (index * 0.05),
    persona,
  }));
}

/**
 * Assemble vault context for a query across accessible personas.
 */
export async function assembleContext(
  query: string,
  maxTokens?: number,
): Promise<AssembledContext> {
  const budget = maxTokens ?? DEFAULT_MAX_TOKENS;
  const personas = getAccessiblePersonas();
  const allItems: ContextItem[] = [];

  for (const persona of personas) {
    const results = await executeToolSearch(persona, query, 20);
    allItems.push(...results);
  }

  allItems.sort((a, b) => b.score - a.score);

  let tokenCount = 0;
  const selected: ContextItem[] = [];

  for (const item of allItems) {
    const itemTokens = estimateTokens(item);
    if (tokenCount + itemTokens > budget && selected.length > 0) break;
    selected.push(item);
    tokenCount += itemTokens;
  }

  return { items: selected, tokenEstimate: tokenCount, personas };
}

/**
 * Run a reasoning agent with multi-turn tool loop.
 *
 * The agent:
 * 1. Sends the query + context to the LLM
 * 2. If the LLM responds with tool calls, executes them and sends results back
 * 3. Repeats until the LLM produces a final answer or max turns reached
 *
 * When no LLM provider is registered, returns a context-based answer
 * built from the assembled context items.
 */
export async function runReasoningAgent(
  query: string,
  context: AssembledContext,
  maxTurns?: number,
): Promise<{ answer: string; sources: string[]; turnsUsed: number }> {
  const turnLimit = maxTurns ?? MAX_REASONING_TURNS;
  const sources: string[] = context.items.map(item => item.id);

  // Without an LLM provider, return a context-based summary
  if (!reasoningProvider) {
    const answer = buildContextAnswer(query, context);
    return { answer, sources, turnsUsed: 0 };
  }

  // Build initial messages
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are Dina, a personal AI assistant. Answer the user's question using the provided vault context. Cite sources by item ID. Available tools: ${TOOL_DECLARATIONS.map(t => t.name).join(', ')}.`,
    },
    {
      role: 'user',
      content: `Context:\n${formatContext(context)}\n\nQuestion: ${query}`,
    },
  ];

  let turnsUsed = 0;

  for (let turn = 0; turn < turnLimit; turn++) {
    turnsUsed++;
    const response = await reasoningProvider(messages);
    messages.push(response);

    // If no tool calls, the LLM has produced a final answer
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return { answer: response.content, sources, turnsUsed };
    }

    // Execute tool calls and add results
    for (const call of response.toolCalls) {
      const toolResult = await executeToolCall(call);
      messages.push({
        role: 'tool',
        content: JSON.stringify(toolResult),
        toolCallId: `${call.name}-${turn}`,
      });

      // Track new sources from tool results
      if (Array.isArray(toolResult)) {
        for (const item of toolResult) {
          if (item && typeof item === 'object' && 'id' in item) {
            sources.push(String(item.id));
          }
        }
      }
    }
  }

  // Max turns reached — extract answer from last assistant message
  const lastAssistant = messages.filter(m => m.role === 'assistant').pop();
  return {
    answer: lastAssistant?.content ?? 'I could not find a complete answer within the reasoning limit.',
    sources: [...new Set(sources)],
    turnsUsed,
  };
}

/** Execute a single tool call. */
async function executeToolCall(call: ToolCall): Promise<unknown> {
  switch (call.name) {
    case 'vault_search': {
      const persona = String(call.args.persona ?? 'general');
      const query = String(call.args.query ?? '');
      const limit = Number(call.args.limit ?? 10);
      return executeToolSearch(persona, query, limit);
    }
    case 'vault_read': {
      const itemId = String(call.args.item_id ?? '');
      for (const persona of getAccessiblePersonas()) {
        const item = getItem(persona, itemId);
        if (item) return item;
      }
      return null;
    }
    default:
      return { error: `unknown tool: ${call.name}` };
  }
}

/** Build a context-based answer without LLM. */
function buildContextAnswer(query: string, context: AssembledContext): string {
  if (context.items.length === 0) {
    return 'I don\'t have any relevant information in my memory about that.';
  }

  const summaries = context.items
    .slice(0, 5)
    .map(item => `- ${item.content_l0}`)
    .filter(s => s.length > 2);

  if (summaries.length === 0) {
    return 'I found some related items but they don\'t contain enough detail to answer.';
  }

  return `Based on my memory:\n${summaries.join('\n')}`;
}

/** Format context items for the LLM system prompt. */
function formatContext(context: AssembledContext): string {
  return context.items.map(item => {
    let text = `[${item.id}] ${item.content_l0}`;
    if (item.content_l1) text += `\n  Detail: ${item.content_l1}`;
    if (item.body) text += `\n  Full: ${item.body}`;
    return text;
  }).join('\n');
}

/** Estimate token count for a context item. */
function estimateTokens(item: ContextItem): number {
  let chars = (item.content_l0 || '').length;
  if (item.content_l1) chars += item.content_l1.length;
  if (item.body) chars += item.body.length;
  return Math.max(1, Math.ceil(chars * TOKENS_PER_CHAR));
}
