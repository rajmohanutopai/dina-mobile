/**
 * Device registry — paired device management.
 *
 * Stores Ed25519 device public keys (multibase-encoded), NOT token hashes.
 * Mobile adaptation: `paired_devices` table with `public_key_multibase`
 * instead of the server's `device_tokens` with `token_hash`.
 *
 * Devices are registered via the pairing ceremony (6-digit code exchange).
 * Revoked devices remain in the registry (revoked=1) for audit trail
 * but cannot authenticate.
 *
 * Source: ARCHITECTURE.md Section 2.63, Task 2.63
 */

import { randomBytes } from '@noble/ciphers/utils.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export type DeviceRole = 'rich' | 'thin' | 'cli';

export interface PairedDevice {
  deviceId: string;
  publicKeyMultibase: string;
  deviceName: string;
  role: DeviceRole;
  lastSeen: number;
  createdAt: number;
  revoked: boolean;
}

/** In-memory device registry keyed by deviceId. */
const devices = new Map<string, PairedDevice>();

/** Public key multibase → deviceId index (for DID-based lookup). */
const keyIndex = new Map<string, string>();

/**
 * Register a new paired device.
 *
 * Called after pairing ceremony completes. Stores the device's Ed25519
 * public key in multibase format.
 *
 * Returns the registered device with a generated deviceId.
 */
export function registerDevice(
  name: string,
  publicKeyMultibase: string,
  role: DeviceRole,
): PairedDevice {
  if (!name || name.trim().length === 0) throw new Error('devices: name is required');
  if (!publicKeyMultibase) throw new Error('devices: publicKeyMultibase is required');

  // Prevent registering duplicate keys
  if (keyIndex.has(publicKeyMultibase)) {
    const existingId = keyIndex.get(publicKeyMultibase)!;
    const existing = devices.get(existingId);
    if (existing && !existing.revoked) {
      throw new Error(`devices: key already registered as "${existing.deviceName}"`);
    }
  }

  const deviceId = `dev-${bytesToHex(randomBytes(8))}`;
  const now = Date.now();

  const device: PairedDevice = {
    deviceId,
    publicKeyMultibase,
    deviceName: name.trim(),
    role,
    lastSeen: now,
    createdAt: now,
    revoked: false,
  };

  devices.set(deviceId, device);
  keyIndex.set(publicKeyMultibase, deviceId);
  return device;
}

/** List all devices (including revoked). */
export function listDevices(): PairedDevice[] {
  return [...devices.values()];
}

/** List only active (non-revoked) devices. */
export function listActiveDevices(): PairedDevice[] {
  return [...devices.values()].filter(d => !d.revoked);
}

/** Get a device by ID. Returns null if not found. */
export function getDevice(deviceId: string): PairedDevice | null {
  return devices.get(deviceId) ?? null;
}

/**
 * Get a device by its public key multibase.
 *
 * Used during authentication to look up the device from
 * the presented Ed25519 public key.
 */
export function getByPublicKey(publicKeyMultibase: string): PairedDevice | null {
  const deviceId = keyIndex.get(publicKeyMultibase);
  if (!deviceId) return null;
  return devices.get(deviceId) ?? null;
}

/**
 * Revoke a device. Marks it as revoked (soft delete).
 *
 * Revoked devices remain for audit trail but cannot authenticate.
 * Returns true if found.
 */
export function revokeDevice(deviceId: string): boolean {
  const device = devices.get(deviceId);
  if (!device) return false;
  device.revoked = true;
  return true;
}

/** Check if a device is active (exists and not revoked). */
export function isDeviceActive(deviceId: string): boolean {
  const device = devices.get(deviceId);
  return device !== null && device !== undefined && !device.revoked;
}

/** Update last_seen timestamp for a device. */
export function touchDevice(deviceId: string): void {
  const device = devices.get(deviceId);
  if (device) device.lastSeen = Date.now();
}

/** Get device count (all, including revoked). */
export function deviceCount(): number {
  return devices.size;
}

/** Reset all device state (for testing). */
export function resetDeviceRegistry(): void {
  devices.clear();
  keyIndex.clear();
}
