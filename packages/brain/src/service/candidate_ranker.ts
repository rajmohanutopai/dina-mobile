/**
 * Service-candidate ranker — selects the best match from AppView search
 * results for a given capability.
 *
 * AppView's `com.dina.service.search` already returns a ranked list (trust
 * score + proximity), but the requester still has to (a) pick the top match
 * and (b) compute a client-side proximity when the server hasn't (or when
 * the user wants a different tie-break). This module owns that logic so the
 * orchestrator is a thin flow controller.
 *
 * Design goals:
 *   - Pure: no I/O, no module-level state. Deterministic output.
 *   - Non-destructive: returns a new sorted array without mutating the input.
 *   - Defensive: entries with obviously-invalid shape (missing DID, missing
 *     capabilities) are filtered out — downstream callers get a guaranteed
 *     `isPublic === true`, `capabilities[] ⊇ {capability}` contract.
 *
 * Haversine formula is used for the client-side distance calc. Accuracy is
 * ~0.5% in typical city-scale distances — well within "pick a bus service"
 * tolerance.
 */

import type { ServiceProfile } from '../appview_client/http';

/** A viewer location used for proximity tie-break. */
export interface Location {
  lat: number;
  lng: number;
}

/** Options for `rankCandidates`. */
export interface RankOptions {
  /**
   * Caller's location. When provided, clients whose `distanceKm` is already
   * present pass through; for others we compute Haversine client-side using
   * `fallbackLocation`-style lat/lng carried on the profile via the AppView
   * lexicon extension. When no client-side coords are available, proximity
   * is treated as unknown and the tiebreaker falls back to service name.
   */
  viewer?: Location;
  /**
   * Optional per-candidate lat/lng lookup — use this when the `ServiceProfile`
   * doesn't carry a lat/lng (AppView's current lexicon carries `distanceKm`
   * pre-computed by the server; a future extension may carry lat/lng and
   * we want the ranker ready).
   */
  coordsOf?: (profile: ServiceProfile) => Location | undefined;
}

/** Per-candidate rank score. Exposed for tests. */
export interface RankedCandidate {
  profile: ServiceProfile;
  /** Distance in km if computable, else `undefined`. */
  distanceKm: number | undefined;
}

/**
 * Return a ranked array of valid candidates for `capability`. The input
 * is neither mutated nor re-referenced — callers receive a fresh array of
 * fresh tuples.
 *
 * Sort order (stable):
 *   1. isPublic=true (filter — non-public entries are dropped)
 *   2. advertises the requested capability (filter)
 *   3. distanceKm ASC (undefined last)
 *   4. service name ASC (case-insensitive)
 *   5. DID ASC (deterministic final tiebreaker)
 */
export function rankCandidates(
  capability: string,
  services: readonly ServiceProfile[],
  options: RankOptions = {},
): RankedCandidate[] {
  if (capability === '') return [];

  const ranked: RankedCandidate[] = [];
  for (const profile of services) {
    if (!profile.isPublic) continue;
    if (!profile.capabilities.includes(capability)) continue;
    if (!profile.did) continue;

    ranked.push({
      profile,
      distanceKm: effectiveDistance(profile, options),
    });
  }

  ranked.sort(compareCandidates);
  return ranked;
}

/**
 * Return the top candidate for `capability`, or `null` when there are none.
 * Convenience wrapper for orchestrators that don't need the full list.
 */
export function pickTopCandidate(
  capability: string,
  services: readonly ServiceProfile[],
  options: RankOptions = {},
): RankedCandidate | null {
  const ranked = rankCandidates(capability, services, options);
  return ranked.length > 0 ? ranked[0] : null;
}

/**
 * Great-circle distance between two (lat, lng) points in kilometres,
 * using the Haversine formula. Exported for tests and downstream reuse.
 */
export function haversineKm(a: Location, b: Location): number {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function effectiveDistance(
  profile: ServiceProfile,
  options: RankOptions,
): number | undefined {
  if (typeof profile.distanceKm === 'number' && Number.isFinite(profile.distanceKm)) {
    return profile.distanceKm;
  }
  const viewer = options.viewer;
  if (viewer === undefined) return undefined;
  if (!isFiniteLocation(viewer)) return undefined;
  const coords = options.coordsOf?.(profile);
  if (coords === undefined || !isFiniteLocation(coords)) return undefined;
  return haversineKm(viewer, coords);
}

function isFiniteLocation(loc: Location): boolean {
  return Number.isFinite(loc.lat) && Number.isFinite(loc.lng);
}

function compareCandidates(a: RankedCandidate, b: RankedCandidate): number {
  // distance: undefined sorts last
  const aHas = a.distanceKm !== undefined;
  const bHas = b.distanceKm !== undefined;
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  if (aHas && bHas && a.distanceKm !== b.distanceKm) {
    return (a.distanceKm as number) - (b.distanceKm as number);
  }

  // name (case-insensitive)
  const nameCmp = a.profile.name.localeCompare(b.profile.name, undefined, {
    sensitivity: 'base',
  });
  if (nameCmp !== 0) return nameCmp;

  // deterministic tiebreaker
  return a.profile.did.localeCompare(b.profile.did);
}
