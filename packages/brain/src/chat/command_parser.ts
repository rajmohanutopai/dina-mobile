/**
 * Chat command parser — detect intent from user text input.
 *
 * Commands:
 *   /remember <text>  → store a memory in the vault
 *   /ask <question>   → search vault + reason about a question
 *   /search <query>   → vault search (FTS only, no LLM)
 *   /help             → show available commands
 *
 * Implicit intent detection:
 *   Questions (who/what/when/where/why/how/is/are/does/did/can/will)
 *   → treated as /ask unless the text is clearly a statement.
 *
 * Source: ARCHITECTURE.md Tasks 4.8, 4.9
 */

export type ChatIntent = 'remember' | 'ask' | 'search' | 'help' | 'chat';

export interface ParsedCommand {
  intent: ChatIntent;
  payload: string;
  explicit: boolean;     // true if slash command, false if detected
  originalText: string;
}

/** Question-starting words (case-insensitive). */
const QUESTION_STARTERS = new Set([
  'who', 'what', 'when', 'where', 'why', 'how',
  'is', 'are', 'was', 'were', 'does', 'did', 'do',
  'can', 'could', 'will', 'would', 'should',
  'has', 'have', 'had',
]);

/**
 * Parse user input into a structured command.
 *
 * 1. Check for explicit slash commands (/remember, /ask, /search, /help)
 * 2. Detect question intent from natural language
 * 3. Default to 'chat' (general conversation)
 */
export function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim();
  if (!trimmed) {
    return { intent: 'chat', payload: '', explicit: false, originalText: text };
  }

  // 1. Explicit slash commands
  if (trimmed.startsWith('/')) {
    return parseSlashCommand(trimmed);
  }

  // 2. Question detection
  if (isQuestion(trimmed)) {
    return { intent: 'ask', payload: trimmed, explicit: false, originalText: text };
  }

  // 3. Default: chat
  return { intent: 'chat', payload: trimmed, explicit: false, originalText: text };
}

/**
 * Parse an explicit slash command.
 */
function parseSlashCommand(text: string): ParsedCommand {
  const parts = text.match(/^\/(\S+)\s*(.*)/s);
  if (!parts) {
    return { intent: 'chat', payload: text, explicit: false, originalText: text };
  }

  const [, command, rest] = parts;
  const payload = rest.trim();

  switch (command.toLowerCase()) {
    case 'remember':
      return { intent: 'remember', payload, explicit: true, originalText: text };
    case 'ask':
      return { intent: 'ask', payload, explicit: true, originalText: text };
    case 'search':
      return { intent: 'search', payload, explicit: true, originalText: text };
    case 'help':
      return { intent: 'help', payload: '', explicit: true, originalText: text };
    default:
      // Unknown command → treat as chat
      return { intent: 'chat', payload: text, explicit: false, originalText: text };
  }
}

/**
 * Detect if text is a question.
 *
 * Heuristics:
 * - Ends with '?'
 * - Starts with a question word (who/what/when/where/why/how/is/are/...)
 */
export function isQuestion(text: string): boolean {
  if (text.endsWith('?')) return true;

  const firstWord = text.split(/\s+/)[0]?.toLowerCase();
  if (firstWord && QUESTION_STARTERS.has(firstWord)) return true;

  return false;
}

/**
 * Get the list of available commands for /help.
 */
export function getAvailableCommands(): Array<{ command: string; description: string }> {
  return [
    { command: '/remember <text>', description: 'Store a memory in your vault' },
    { command: '/ask <question>', description: 'Ask a question — searches your vault and reasons about it' },
    { command: '/search <query>', description: 'Search your vault (keyword search, no LLM)' },
    { command: '/help', description: 'Show available commands' },
  ];
}
