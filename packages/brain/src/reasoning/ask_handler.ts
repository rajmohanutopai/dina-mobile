/**
 * Factory that converts the agentic reasoning loop into a chat
 * `/ask`-command handler. Installed by the app-layer bootstrap so that
 * `handleChat('/ask …')` flows through the multi-turn tool-use loop
 * instead of the single-shot reason() fallback.
 *
 * The handler is tool-agnostic — whatever ToolRegistry the bootstrap
 * supplies is what the LLM sees. The LLM learns tool names + parameters
 * from the provider's `tools` channel (Anthropic Messages `tools`,
 * OpenAI `tools`, etc.); the system prompt below carries only BEHAVIOUR
 * rules (when to use tools, how to handle errors, how to handle async
 * dispatch) — never an enumeration of tools. Adding a new capability is
 * a registry insertion, not a prompt edit.
 *
 * The returned handler matches the `AskCommandHandler` signature the
 * chat orchestrator exposes (`setAskCommandHandler`). Task IDs from
 * successful `query_service` tool calls are surfaced as sources so the
 * chat UI can tap through to the corresponding workflow task.
 */

import type { AskCommandHandler } from '../chat/orchestrator';
import type { LLMProvider } from '../llm/adapters/provider';
import { runAgenticTurn, type AgenticLoopOptions } from './agentic_loop';
import type { ToolRegistry } from './tool_registry';

export interface AgenticAskHandlerOptions {
  provider: LLMProvider;
  tools: ToolRegistry;
  /** Override the default Bus Driver system prompt. */
  systemPrompt?: string;
  /** Pass-through for loop budget / cancellation. */
  loopOptions?: AgenticLoopOptions;
  /** Optional sink for diagnostics — last turn's trace, usage, etc. */
  onTurn?: (trace: {
    query: string;
    answer: string;
    toolCalls: Array<{ name: string; outcome: { success: boolean } }>;
    finishReason: string;
    tokens: { input: number; output: number };
  }) => void;
}

export const DEFAULT_ASK_SYSTEM_PROMPT = `You are Dina's helpful assistant.

Behaviour rules (the specific tools available to you come through the provider's tool channel — read their descriptions to decide when each applies):

1. Use a tool only when it helps answer the user's question. Conversational or general-knowledge questions should be answered directly, with no tool calls.

2. If a tool's description indicates it dispatches asynchronous work (e.g. returns a task_id, a "pending" status, or otherwise signals that the real answer will arrive later), acknowledge the dispatch briefly ("Looking that up…", "Asking the provider…") and stop. Do NOT fabricate the result. The real answer is delivered separately by Dina's workflow-event pipeline when the remote side responds; the user will see it in the chat.

3. Never fabricate tool results. If a tool errors, tell the user honestly what went wrong.

4. Chain tools when later tools depend on earlier tool outputs. Respect the dependencies described in each tool's own description rather than following a fixed sequence.`;

export function makeAgenticAskHandler(
  options: AgenticAskHandlerOptions,
): AskCommandHandler {
  return async (query) => {
    const result = await runAgenticTurn({
      provider: options.provider,
      tools: options.tools,
      systemPrompt: options.systemPrompt ?? DEFAULT_ASK_SYSTEM_PROMPT,
      userMessage: query,
      options: options.loopOptions,
    });

    if (options.onTurn !== undefined) {
      options.onTurn({
        query,
        answer: result.answer,
        toolCalls: result.toolCalls.map((c) => ({
          name: c.name,
          outcome: { success: c.outcome.success },
        })),
        finishReason: result.finishReason,
        tokens: { input: result.usage.inputTokens, output: result.usage.outputTokens },
      });
    }

    // Sources: task_ids from successful query_service calls let the chat
    // UI link to the corresponding workflow task (pending delivery).
    const sources: string[] = [];
    for (const call of result.toolCalls) {
      if (!call.outcome.success) continue;
      if (call.name !== 'query_service') continue;
      const payload = call.outcome.result as { task_id?: string } | null;
      if (payload && typeof payload.task_id === 'string' && payload.task_id !== '') {
        sources.push(payload.task_id);
      }
    }

    // Handle empty answers (e.g. budget-exceeded with no final text).
    const answer = result.answer !== ''
      ? result.answer
      : fallbackAnswer(result.finishReason);

    return { response: answer, sources };
  };
}

function fallbackAnswer(reason: string): string {
  switch (reason) {
    case 'max_iterations':
    case 'max_tool_calls':
      return `I've hit my reasoning budget for this request. Try again with a more specific question.`;
    case 'cancelled':
      return `Request cancelled.`;
    case 'provider_error':
      return `Sorry — the reasoning service is unreachable right now. Try again in a moment.`;
    default:
      return `(no answer)`;
  }
}
