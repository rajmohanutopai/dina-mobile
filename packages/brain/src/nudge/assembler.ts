/**
 * Nudge assembler — gather vault context for contact-specific nudges.
 *
 * A nudge is a context-aware suggestion shown before/during a contact
 * interaction. It gathers recent messages, relationship notes, pending
 * promises, and upcoming events for a contact.
 *
 * Returns null if there's nothing useful to surface (Silence First).
 *
 * Source: ARCHITECTURE.md Task 3.24
 */

import { queryVault, clearVaults } from '../../../core/src/vault/crud';

export interface NudgeItem {
  type: 'message' | 'note' | 'promise' | 'event' | 'preference';
  text: string;
  source: string;
  timestamp: number;
}

export interface Nudge {
  contactDID: string;
  items: NudgeItem[];
  summary: string;
  generatedAt: number;
}

/**
 * Assemble a nudge for a specific contact.
 *
 * Searches the vault for items related to the contact (by DID or alias).
 * Returns null if no relevant context is found (Silence First — no empty nudges).
 *
 * @param contactDID — the contact's DID
 * @param contactName — display name or alias (used for vault search)
 * @param personas — personas to search (default: ['general'])
 */
export function assembleNudge(
  contactDID: string,
  contactName: string,
  personas?: string[],
): Nudge | null {
  const searchPersonas = personas ?? ['general'];
  const allItems: NudgeItem[] = [];

  for (const persona of searchPersonas) {
    // Search by contact name
    const results = queryVault(persona, { mode: 'fts5', text: contactName, limit: 10 });

    for (const item of results) {
      allItems.push({
        type: classifyNudgeType(item.type, item.summary),
        text: item.content_l0 || item.summary || '',
        source: persona,
        timestamp: item.timestamp,
      });
    }
  }

  if (allItems.length === 0) return null;

  // Sort by recency
  allItems.sort((a, b) => b.timestamp - a.timestamp);

  // Take top 5 most relevant
  const topItems = allItems.slice(0, 5);

  return {
    contactDID,
    items: topItems,
    summary: buildNudgeSummary(contactName, topItems),
    generatedAt: Date.now(),
  };
}

/**
 * Classify the nudge item type from vault item metadata.
 */
function classifyNudgeType(itemType: string, summary: string): NudgeItem['type'] {
  const lower = (summary || '').toLowerCase();

  if (lower.includes('promise') || lower.includes('lend') || lower.includes('owe')) {
    return 'promise';
  }
  if (lower.includes('birthday') || lower.includes('meeting') || lower.includes('appointment')) {
    return 'event';
  }
  if (lower.includes('prefer') || lower.includes('likes') || lower.includes('favorite')) {
    return 'preference';
  }
  if (itemType === 'relationship_note' || itemType === 'social') {
    return 'note';
  }

  return 'message';
}

/**
 * Build a human-readable nudge summary.
 */
function buildNudgeSummary(contactName: string, items: NudgeItem[]): string {
  if (items.length === 0) return '';

  const parts: string[] = [];

  const promises = items.filter(i => i.type === 'promise');
  if (promises.length > 0) {
    parts.push(`${promises.length} pending promise${promises.length > 1 ? 's' : ''}`);
  }

  const events = items.filter(i => i.type === 'event');
  if (events.length > 0) {
    parts.push(`${events.length} upcoming event${events.length > 1 ? 's' : ''}`);
  }

  const preferences = items.filter(i => i.type === 'preference');
  if (preferences.length > 0) {
    parts.push(`${preferences.length} known preference${preferences.length > 1 ? 's' : ''}`);
  }

  const messages = items.filter(i => i.type === 'message' || i.type === 'note');
  if (messages.length > 0) {
    parts.push(`${messages.length} recent interaction${messages.length > 1 ? 's' : ''}`);
  }

  if (parts.length === 0) return `Context for ${contactName}`;
  return `${contactName}: ${parts.join(', ')}`;
}
