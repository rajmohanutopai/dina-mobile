/**
 * Chat message model + thread — in-memory conversation storage.
 *
 * Message types:
 *   user     — user's text input
 *   dina     — Dina's response (vault-grounded answer)
 *   approval — approval request card
 *   nudge    — context-aware suggestion
 *   briefing — daily briefing card
 *   system   — system event ("Persona unlocked", "Reminder set")
 *   error    — error message
 *
 * Messages are stored in chronological order per conversation thread.
 * The thread ID is typically the persona or session.
 *
 * Source: ARCHITECTURE.md Task 4.6
 */

import { randomBytes } from '@noble/ciphers/utils.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export type MessageType = 'user' | 'dina' | 'approval' | 'nudge' | 'briefing' | 'system' | 'error';

export interface ChatMessage {
  id: string;
  threadId: string;
  type: MessageType;
  content: string;
  metadata?: Record<string, unknown>;
  sources?: string[];
  timestamp: number;
}

/** Per-thread message stores. */
const threads = new Map<string, ChatMessage[]>();

/**
 * Add a message to a thread.
 */
export function addMessage(
  threadId: string,
  type: MessageType,
  content: string,
  options?: { metadata?: Record<string, unknown>; sources?: string[] },
): ChatMessage {
  let thread = threads.get(threadId);
  if (!thread) {
    thread = [];
    threads.set(threadId, thread);
  }

  const msg: ChatMessage = {
    id: `cm-${bytesToHex(randomBytes(6))}`,
    threadId,
    type,
    content,
    metadata: options?.metadata,
    sources: options?.sources,
    timestamp: Date.now(),
  };

  thread.push(msg);
  return msg;
}

/**
 * Get all messages in a thread, chronological order.
 */
export function getThread(threadId: string): ChatMessage[] {
  return [...(threads.get(threadId) ?? [])];
}

/**
 * Get the most recent N messages from a thread.
 */
export function getRecentMessages(threadId: string, limit: number): ChatMessage[] {
  const thread = threads.get(threadId) ?? [];
  return thread.slice(-limit);
}

/**
 * Get messages filtered by type.
 */
export function getMessagesByType(threadId: string, type: MessageType): ChatMessage[] {
  return (threads.get(threadId) ?? []).filter(m => m.type === type);
}

/**
 * Get a single message by ID.
 */
export function getMessage(messageId: string): ChatMessage | null {
  for (const thread of threads.values()) {
    const msg = thread.find(m => m.id === messageId);
    if (msg) return msg;
  }
  return null;
}

/**
 * Count messages in a thread.
 */
export function threadLength(threadId: string): number {
  return threads.get(threadId)?.length ?? 0;
}

/**
 * List all thread IDs.
 */
export function listThreads(): string[] {
  return [...threads.keys()];
}

/**
 * Delete a thread.
 */
export function deleteThread(threadId: string): boolean {
  return threads.delete(threadId);
}

/**
 * Add a user message (convenience).
 */
export function addUserMessage(threadId: string, content: string): ChatMessage {
  return addMessage(threadId, 'user', content);
}

/**
 * Add a Dina response (convenience).
 */
export function addDinaResponse(
  threadId: string,
  content: string,
  sources?: string[],
): ChatMessage {
  return addMessage(threadId, 'dina', content, { sources });
}

/**
 * Add a system event message.
 */
export function addSystemMessage(threadId: string, content: string): ChatMessage {
  return addMessage(threadId, 'system', content);
}

/** Reset all threads (for testing). */
export function resetThreads(): void {
  threads.clear();
}
