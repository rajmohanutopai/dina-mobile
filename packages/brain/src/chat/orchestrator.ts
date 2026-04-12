/**
 * Chat orchestrator — user-facing entry point for chat interactions.
 *
 * Ties together: command parser → intent routing → handler → thread update.
 *
 * Intents:
 *   /remember → store in vault via staging
 *   /ask (or question) → reason pipeline (vault search + LLM)
 *   /search → vault FTS search (no LLM)
 *   /help → return command list
 *   chat → general conversation via reasoning pipeline
 *
 * Source: ARCHITECTURE.md Tasks 4.7–4.9
 */

import { parseCommand, getAvailableCommands, type ChatIntent } from './command_parser';
import { addUserMessage, addDinaResponse, addSystemMessage } from './thread';
import { reason } from '../pipeline/chat_reasoning';
import { executeToolSearch } from '../vault_context/assembly';
import { ingest } from '../../../core/src/staging/service';

export interface ChatResponse {
  intent: ChatIntent;
  response: string;
  sources: string[];
  messageId: string;
}

/** Default thread ID for the main chat. */
const DEFAULT_THREAD = 'main';

/** Default persona for reasoning. */
let defaultPersona = 'general';

/** Default LLM provider. */
let defaultProvider = 'none';

/** Set the default persona for chat reasoning. */
export function setDefaultPersona(persona: string): void {
  defaultPersona = persona;
}

/** Set the default LLM provider. */
export function setDefaultProvider(provider: string): void {
  defaultProvider = provider;
}

/** Reset defaults (for testing). */
export function resetChatDefaults(): void {
  defaultPersona = 'general';
  defaultProvider = 'none';
}

/**
 * Handle a user chat message.
 *
 * Parses the input, routes to the appropriate handler,
 * stores both user message and response in the thread.
 */
export async function handleChat(
  text: string,
  threadId?: string,
): Promise<ChatResponse> {
  const thread = threadId ?? DEFAULT_THREAD;
  const parsed = parseCommand(text);

  // Store user message
  addUserMessage(thread, text);

  let response: string;
  let sources: string[] = [];

  switch (parsed.intent) {
    case 'remember':
      response = await handleRemember(parsed.payload);
      break;

    case 'ask':
      ({ response, sources } = await handleAsk(parsed.payload));
      break;

    case 'search':
      ({ response, sources } = await handleSearch(parsed.payload));
      break;

    case 'help':
      response = handleHelp();
      break;

    case 'chat':
    default:
      ({ response, sources } = await handleAsk(parsed.payload));
      break;
  }

  // Store response
  const msg = addDinaResponse(thread, response, sources.length > 0 ? sources : undefined);

  return {
    intent: parsed.intent,
    response,
    sources,
    messageId: msg.id,
  };
}

/** Handle /remember: store text via staging ingest. */
async function handleRemember(text: string): Promise<string> {
  if (!text) return 'What would you like me to remember?';

  const { id, duplicate } = ingest({
    source: 'user_remember',
    source_id: `remember-${Date.now()}`,
    data: { summary: text, type: 'user_memory', body: text },
  });

  if (duplicate) return 'I already have that stored.';
  return `Got it — I'll remember that. (${id})`;
}

/** Handle /ask or detected question: reason pipeline. */
async function handleAsk(query: string): Promise<{ response: string; sources: string[] }> {
  if (!query) return { response: 'What would you like to know?', sources: [] };

  const result = await reason({
    query,
    persona: defaultPersona,
    provider: defaultProvider,
  });

  return { response: result.answer, sources: result.sources };
}

/** Handle /search: vault FTS only, no LLM. */
async function handleSearch(query: string): Promise<{ response: string; sources: string[] }> {
  if (!query) return { response: 'What would you like to search for?', sources: [] };

  const items = await executeToolSearch(defaultPersona, query, 10);

  if (items.length === 0) {
    return { response: 'No results found.', sources: [] };
  }

  const lines = items.map((item, i) => `${i + 1}. ${item.content_l0}`);
  return {
    response: `Found ${items.length} result(s):\n${lines.join('\n')}`,
    sources: items.map(i => i.id),
  };
}

/** Handle /help: return available commands. */
function handleHelp(): string {
  const commands = getAvailableCommands();
  return commands.map(c => `${c.command} — ${c.description}`).join('\n');
}
