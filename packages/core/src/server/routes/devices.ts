/**
 * Device endpoints — list and revoke paired devices.
 *
 * GET    /v1/devices      → list all paired devices
 * GET    /v1/devices/:id  → get single device
 * DELETE /v1/devices/:id  → revoke a device
 *
 * Source: ARCHITECTURE.md Task 2.78
 */

import { Router, type Request, type Response } from 'express';
import {
  listDevices, getDevice, revokeDevice, registerDevice,
  type DeviceRole,
} from '../../devices/registry';

const VALID_ROLES = new Set<string>(['rich', 'thin', 'cli']);

export function createDevicesRouter(): Router {
  const router = Router();

  // GET /v1/devices — list all paired devices
  router.get('/v1/devices', (_req: Request, res: Response) => {
    const devices = listDevices();
    res.json({
      devices: devices.map(d => ({
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        role: d.role,
        revoked: d.revoked,
        lastSeen: d.lastSeen,
        createdAt: d.createdAt,
      })),
      count: devices.length,
    });
  });

  // POST /v1/devices — register a new device (for pairing)
  router.post('/v1/devices', (req: Request, res: Response) => {
    try {
      const body = parseJSON(req);
      const name = String(body.name ?? '');
      const publicKeyMultibase = String(body.publicKeyMultibase ?? '');
      const role = String(body.role ?? 'rich');

      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      if (!publicKeyMultibase) { res.status(400).json({ error: 'publicKeyMultibase is required' }); return; }
      if (!VALID_ROLES.has(role)) {
        res.status(400).json({ error: `role must be one of: ${[...VALID_ROLES].join(', ')}` });
        return;
      }

      const device = registerDevice(name, publicKeyMultibase, role as DeviceRole);
      res.status(201).json({
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        role: device.role,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('already registered') ? 409 : 400;
      res.status(status).json({ error: msg });
    }
  });

  // GET /v1/devices/:id — get single device
  router.get('/v1/devices/:id', (req: Request, res: Response) => {
    const device = getDevice(String(req.params.id));
    if (!device) { res.status(404).json({ error: 'Device not found' }); return; }
    res.json(device);
  });

  // DELETE /v1/devices/:id — revoke a device
  router.delete('/v1/devices/:id', (req: Request, res: Response) => {
    const revoked = revokeDevice(String(req.params.id));
    if (!revoked) { res.status(404).json({ error: 'Device not found' }); return; }
    res.json({ revoked: true });
  });

  return router;
}

function parseJSON(req: Request): Record<string, unknown> {
  const raw = req.body instanceof Buffer ? req.body.toString('utf-8') : '';
  return raw ? JSON.parse(raw) : {};
}
