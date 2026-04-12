/**
 * Nonce replay cache — prevents Ed25519 request replay attacks.
 *
 * Double-buffer design: two Sets alternate. On rotation, the "old" buffer
 * is discarded and the "current" becomes "old". A nonce is checked against
 * both buffers but only inserted into "current".
 *
 * This means a nonce is remembered for between 1× and 2× the rotation
 * interval (matching the timestamp window).
 *
 * Source: core/internal/middleware/nonce.go
 */

export class NonceCache {
  private current: Set<string> = new Set();
  private previous: Set<string> = new Set();

  /**
   * Check if a nonce has been seen. If not, record it. If yes, reject.
   *
   * @param nonce - Hex string nonce from X-Nonce header
   * @returns true if nonce is fresh (not seen before), false if replayed
   */
  check(nonce: string): boolean {
    if (!nonce || nonce.length === 0) {
      return false; // empty nonce always rejected
    }

    // Check both buffers
    if (this.current.has(nonce) || this.previous.has(nonce)) {
      return false; // replay detected
    }

    // Fresh — record in current buffer
    this.current.add(nonce);
    return true;
  }

  /**
   * Rotate the double buffer.
   *
   * Discard the previous buffer and promote current → previous.
   * Called periodically (typically every 5 minutes to match timestamp window).
   */
  rotate(): void {
    this.previous = this.current;
    this.current = new Set();
  }

  /** Number of nonces currently tracked (both buffers). */
  size(): number {
    return this.current.size + this.previous.size;
  }
}
