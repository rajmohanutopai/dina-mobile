/**
 * Persona service — create, list, and manage persona lifecycle.
 *
 * Personas partition the user's vault into isolated compartments:
 *   default  — auto-opens on boot (e.g., "general")
 *   standard — auto-opens on boot (e.g., "work", "social")
 *   sensitive — requires explicit approval to open (e.g., "health")
 *   locked   — requires passphrase to open (e.g., "secret")
 *
 * At onboarding, exactly one "general" persona is created (default tier).
 * Users create additional personas via the Settings UI.
 *
 * Source: ARCHITECTURE.md Section 4, Task 2.33
 */

import { type PersonaTier, autoOpensOnBoot, requiresApproval, requiresPassphrase } from '../vault/lifecycle';

export interface PersonaState {
  name: string;
  tier: PersonaTier;
  isOpen: boolean;
  description: string;
  createdAt: number;
}

/** In-memory persona registry. */
const personas = new Map<string, PersonaState>();

/**
 * Create a new persona with the given tier.
 *
 * Throws if a persona with the same name already exists.
 * Names are normalized to lowercase for uniqueness checking.
 */
export function createPersona(name: string, tier: PersonaTier, description?: string): PersonaState {
  if (!name || name.trim().length === 0) {
    throw new Error('persona: name is required');
  }

  const normalized = name.trim().toLowerCase();

  if (personas.has(normalized)) {
    throw new Error(`persona: "${normalized}" already exists`);
  }

  const state: PersonaState = {
    name: normalized,
    tier,
    isOpen: false,
    description: description ?? '',
    createdAt: Date.now(),
  };

  personas.set(normalized, state);
  return state;
}

/** List all personas. */
export function listPersonas(): PersonaState[] {
  return [...personas.values()];
}

/** Get a persona by name. Returns null if not found. */
export function getPersona(name: string): PersonaState | null {
  return personas.get(name.trim().toLowerCase()) ?? null;
}

/** Get a persona's tier. Throws if not found. */
export function getPersonaTier(name: string): PersonaTier {
  const persona = getPersona(name);
  if (!persona) throw new Error(`persona: "${name}" not found`);
  return persona.tier;
}

/** Check if a persona is currently open (vault accessible). */
export function isPersonaOpen(name: string): boolean {
  const persona = getPersona(name);
  return persona?.isOpen ?? false;
}

/**
 * Open a persona (mark vault as accessible).
 *
 * Enforces tier rules:
 *   default/standard → auto-approved
 *   sensitive → requires approval (caller must have confirmed)
 *   locked → requires passphrase (caller must have confirmed)
 *
 * @param approved — caller has obtained approval/passphrase
 */
export function openPersona(name: string, approved?: boolean): boolean {
  const persona = getPersona(name);
  if (!persona) throw new Error(`persona: "${name}" not found`);

  if (persona.isOpen) return true; // already open

  // Check tier requirements
  if ((requiresApproval(persona.tier) || requiresPassphrase(persona.tier)) && !approved) {
    return false; // needs user approval or passphrase
  }

  persona.isOpen = true;
  return true;
}

/** Close a persona (mark vault as inaccessible). */
export function closePersona(name: string): void {
  const persona = getPersona(name);
  if (!persona) throw new Error(`persona: "${name}" not found`);
  persona.isOpen = false;
}

/**
 * Open all personas that auto-open on boot (default + standard tiers).
 * Returns the names of personas that were opened.
 */
export function openBootPersonas(): string[] {
  const opened: string[] = [];
  for (const persona of personas.values()) {
    if (autoOpensOnBoot(persona.tier) && !persona.isOpen) {
      persona.isOpen = true;
      opened.push(persona.name);
    }
  }
  return opened;
}

/** Update persona description. */
export function setPersonaDescription(name: string, description: string): void {
  const persona = getPersona(name);
  if (!persona) throw new Error(`persona: "${name}" not found`);
  persona.description = description;
}

/** Check if a persona exists. */
export function personaExists(name: string): boolean {
  return personas.has(name.trim().toLowerCase());
}

/** Reset all persona state (for testing). */
export function resetPersonaState(): void {
  personas.clear();
}
