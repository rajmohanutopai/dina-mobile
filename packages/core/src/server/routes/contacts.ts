/**
 * Contact endpoints — CRUD, sharing policy, scenario policy, aliases.
 *
 * GET    /v1/contacts                   → list all contacts
 * POST   /v1/contacts                   → add a contact
 * GET    /v1/contacts/:did              → get single contact
 * DELETE /v1/contacts/:did              → delete a contact
 * GET    /v1/contacts/:did/policy       → get sharing policy
 * POST   /v1/contacts/:did/policy       → set sharing policy
 * GET    /v1/contacts/:did/scenarios    → get scenario policy (deny list)
 * POST   /v1/contacts/:did/scenarios    → set scenario policy (deny list)
 * GET    /v1/contacts/:did/aliases      → list aliases
 * POST   /v1/contacts/:did/aliases      → add alias
 * DELETE /v1/contacts/:did/aliases/:alias → remove alias
 *
 * Source: ARCHITECTURE.md Task 2.74
 */

import { Router, type Request, type Response } from 'express';
import {
  addContact, getContact, listContacts, updateContact, deleteContact,
  addAlias, removeAlias,
  type TrustLevel, type SharingTier,
} from '../../contacts/directory';
import {
  setSharingPolicy, getSharingTier, clearSharingPolicies,
  type SharingTier as PolicySharingTier,
} from '../../gatekeeper/sharing';
import { setScenarioDeny } from '../../d2d/gates';

const VALID_TRUST_LEVELS = new Set<string>(['blocked', 'unknown', 'verified', 'trusted']);
const VALID_SHARING_TIERS = new Set<string>(['none', 'summary', 'full', 'locked']);

/** Per-contact scenario deny lists (in-memory, endpoint-level). */
const scenarioDenyLists = new Map<string, string[]>();

/** Reset scenario deny state (for testing). */
export function resetScenarioDenyLists(): void {
  scenarioDenyLists.clear();
}

export function createContactsRouter(): Router {
  const router = Router();

  // GET /v1/contacts — list all
  router.get('/v1/contacts', (_req: Request, res: Response) => {
    const contacts = listContacts();
    res.json({
      contacts: contacts.map(c => ({
        did: c.did, displayName: c.displayName,
        trustLevel: c.trustLevel, sharingTier: c.sharingTier,
        aliases: c.aliases,
      })),
      count: contacts.length,
    });
  });

  // POST /v1/contacts — add a contact
  router.post('/v1/contacts', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const did = String(body.did ?? '');
      const displayName = String(body.displayName ?? '');
      const trustLevel = body.trustLevel ? String(body.trustLevel) : undefined;
      const sharingTier = body.sharingTier ? String(body.sharingTier) : undefined;

      if (!did) { res.status(400).json({ error: 'did is required' }); return; }
      if (!displayName) { res.status(400).json({ error: 'displayName is required' }); return; }
      if (trustLevel && !VALID_TRUST_LEVELS.has(trustLevel)) {
        res.status(400).json({ error: `trustLevel must be one of: ${[...VALID_TRUST_LEVELS].join(', ')}` });
        return;
      }
      if (sharingTier && !VALID_SHARING_TIERS.has(sharingTier)) {
        res.status(400).json({ error: `sharingTier must be one of: ${[...VALID_SHARING_TIERS].join(', ')}` });
        return;
      }

      const contact = addContact(
        did, displayName,
        trustLevel as TrustLevel | undefined,
        sharingTier as SharingTier | undefined,
      );
      res.status(201).json({
        did: contact.did, displayName: contact.displayName,
        trustLevel: contact.trustLevel, sharingTier: contact.sharingTier,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('already exists') ? 409 : 400;
      res.status(status).json({ error: msg });
    }
  });

  // GET /v1/contacts/:did — get single contact
  router.get('/v1/contacts/:did', (req: Request, res: Response) => {
    const contact = getContact(String(req.params.did));
    if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }
    res.json(contact);
  });

  // DELETE /v1/contacts/:did — delete
  router.delete('/v1/contacts/:did', (req: Request, res: Response) => {
    const deleted = deleteContact(String(req.params.did));
    if (!deleted) { res.status(404).json({ error: 'Contact not found' }); return; }
    res.json({ deleted: true });
  });

  // GET /v1/contacts/:did/policy — get sharing policy
  router.get('/v1/contacts/:did/policy', (req: Request, res: Response) => {
    const did = String(req.params.did);
    const contact = getContact(did);
    if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }

    // Return known category tiers
    const categories = ['general', 'health', 'financial', 'social', 'work'];
    const policy: Record<string, string> = {};
    for (const cat of categories) {
      policy[cat] = getSharingTier(did, cat);
    }
    res.json({ did, policy });
  });

  // POST /v1/contacts/:did/policy — set sharing policy
  router.post('/v1/contacts/:did/policy', (req: Request, res: Response) => {
    try {
      const did = String(req.params.did);
      const contact = getContact(did);
      if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }

      const body = parseJSON(req);
      const category = String(body.category ?? '');
      const tier = String(body.tier ?? '');

      if (!category) { res.status(400).json({ error: 'category is required' }); return; }
      if (!VALID_SHARING_TIERS.has(tier)) {
        res.status(400).json({ error: `tier must be one of: ${[...VALID_SHARING_TIERS].join(', ')}` });
        return;
      }

      setSharingPolicy(did, category, tier as PolicySharingTier);
      res.json({ did, category, tier });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /v1/contacts/:did/scenarios — get scenario deny list
  router.get('/v1/contacts/:did/scenarios', (req: Request, res: Response) => {
    const did = String(req.params.did);
    const contact = getContact(did);
    if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }

    const denied = scenarioDenyLists.get(did) ?? [];
    res.json({ did, denied });
  });

  // POST /v1/contacts/:did/scenarios — set scenario deny list
  router.post('/v1/contacts/:did/scenarios', (req: Request, res: Response) => {
    try {
      const did = String(req.params.did);
      const contact = getContact(did);
      if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }

      const body = parseJSON(req);
      const denied = body.denied;
      if (!Array.isArray(denied)) {
        res.status(400).json({ error: 'denied must be an array of message types' });
        return;
      }

      const denyList = denied.map(String);
      scenarioDenyLists.set(did, denyList);
      setScenarioDeny(did, denyList);
      res.json({ did, denied: denyList });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /v1/contacts/:did/aliases — list aliases
  router.get('/v1/contacts/:did/aliases', (req: Request, res: Response) => {
    const contact = getContact(String(req.params.did));
    if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }
    res.json({ did: contact.did, aliases: contact.aliases });
  });

  // POST /v1/contacts/:did/aliases — add alias
  router.post('/v1/contacts/:did/aliases', (req: Request, res: Response) => {
    try {
      const did = String(req.params.did);
      const body = parseJSON(req);
      const alias = String(body.alias ?? '');

      if (!alias) { res.status(400).json({ error: 'alias is required' }); return; }

      addAlias(did, alias);
      const contact = getContact(did)!;
      res.status(201).json({ did, aliases: contact.aliases });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('not found') ? 404
        : msg.includes('already taken') ? 409
        : 400;
      res.status(status).json({ error: msg });
    }
  });

  // DELETE /v1/contacts/:did/aliases/:alias — remove alias
  router.delete('/v1/contacts/:did/aliases/:alias', (req: Request, res: Response) => {
    try {
      const did = String(req.params.did);
      const alias = String(req.params.alias);
      removeAlias(did, alias);
      const contact = getContact(did)!;
      res.json({ did, aliases: contact.aliases });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(404).json({ error: msg });
    }
  });

  return router;
}

function parseJSON(req: Request): Record<string, unknown> {
  const raw = req.body instanceof Buffer ? req.body.toString('utf-8') : '';
  return raw ? JSON.parse(raw) : {};
}
