/**
 * Entity Vault — ephemeral PII token mapping for cloud LLM calls.
 *
 * Created per-LLM-call. Maps [TYPE_N] tokens to original PII values.
 * Used for scrub → LLM → rehydrate cycle. NEVER persisted, NEVER logged.
 * Each concurrent call has its own isolated vault (no cross-contamination).
 *
 * Source: brain/tests/test_pii.py (Entity Vault section)
 */

import { scrubPII, rehydratePII } from '../../../core/src/pii/patterns';

export interface EntityVaultEntry {
  token: string;   // e.g., "[EMAIL_1]"
  type: string;    // e.g., "EMAIL"
  value: string;   // e.g., "john@example.com"
}

export class EntityVault {
  private readonly map: Map<string, EntityVaultEntry> = new Map();

  /**
   * Scrub text, storing token→value mappings in the vault.
   * Returns the scrubbed text with PII replaced by tokens.
   */
  scrub(text: string): string {
    const result = scrubPII(text);

    for (const entity of result.entities) {
      this.map.set(entity.token, {
        token: entity.token,
        type: entity.type,
        value: entity.value,
      });
    }

    return result.scrubbed;
  }

  /**
   * Rehydrate text, restoring original values from vault.
   * Tokens not in the vault are left as-is.
   */
  rehydrate(text: string): string {
    const entities = Array.from(this.map.values()).map(e => ({
      token: e.token,
      value: e.value,
    }));
    return rehydratePII(text, entities);
  }

  /** Get all entries in the vault. */
  entries(): EntityVaultEntry[] {
    return Array.from(this.map.values());
  }

  /** Check if the vault has any entries. */
  isEmpty(): boolean {
    return this.map.size === 0;
  }

  /** Number of tracked entities. */
  size(): number {
    return this.map.size;
  }

  /**
   * Clear all entries.
   * Called after rehydration is complete to ensure PII is not retained.
   */
  clear(): void {
    this.map.clear();
  }
}
