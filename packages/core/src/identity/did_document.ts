/**
 * W3C DID Document construction and validation.
 *
 * Structure aligned with Go's identity adapter:
 * - @context: ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/multikey/v1"]
 * - verificationMethod: Multikey type with publicKeyMultibase
 * - Fragment: #key-1 (singular, matching Go)
 * - service: [{ id: "#dina-messaging", type: "DinaMsgBox", serviceEndpoint: "wss://..." }]
 * - created: ISO 8601 timestamp
 * - authentication references the verification method
 *
 * Source: core/internal/adapter/identity/did_document.go
 */

/** Multikey verification method (matching Go's Multikey type). */
export interface VerificationMethod {
  id: string;
  type: 'Multikey';
  controller: string;
  publicKeyMultibase: string;
}

export interface ServiceEndpoint {
  id: string;
  type: 'DinaMsgBox' | 'DinaDirectHTTPS';
  serviceEndpoint: string;
}

export interface DIDDocument {
  '@context': string[];
  id: string;
  verificationMethod: VerificationMethod[];
  authentication: string[];
  service: ServiceEndpoint[];
  /** ISO 8601 creation timestamp (matching Go's created_at). */
  created?: string;
}

/** DID v1 context (W3C standard). */
const DID_V1_CONTEXT = 'https://www.w3.org/ns/did/v1';

/** Multikey context (required for Multikey verification method type). */
const MULTIKEY_CONTEXT = 'https://w3id.org/security/multikey/v1';

/**
 * Build a W3C DID Document from identity material.
 *
 * Produces a document compatible with Go's identity system:
 * - Two @context values (DID v1 + Multikey v1)
 * - Multikey verification method type
 * - #key-1 fragment (singular, matching Go)
 * - created timestamp
 *
 * @param did - The DID (did:plc:... or did:key:...)
 * @param publicKeyMultibase - z-prefixed multibase Ed25519 public key
 * @param msgboxEndpoint - MsgBox WebSocket URL (optional)
 */
export function buildDIDDocument(
  did: string,
  publicKeyMultibase: string,
  msgboxEndpoint?: string,
): DIDDocument {
  const vmId = `${did}#key-1`;

  const doc: DIDDocument = {
    '@context': [DID_V1_CONTEXT, MULTIKEY_CONTEXT],
    id: did,
    verificationMethod: [
      {
        id: vmId,
        type: 'Multikey',
        controller: did,
        publicKeyMultibase,
      },
    ],
    authentication: [vmId],
    service: [],
    created: new Date().toISOString(),
  };

  if (msgboxEndpoint) {
    doc.service.push({
      id: '#dina-messaging',
      type: 'DinaMsgBox',
      serviceEndpoint: msgboxEndpoint,
    });
  }

  return doc;
}

/**
 * Validate a DID Document structure.
 * @returns List of validation errors (empty = valid)
 */
export function validateDIDDocument(doc: DIDDocument): string[] {
  const errors: string[] = [];

  if (!doc['@context'] || !doc['@context'].includes(DID_V1_CONTEXT)) {
    errors.push('@context must include W3C DID v1 context');
  }
  if (!doc['@context'] || !doc['@context'].includes(MULTIKEY_CONTEXT)) {
    errors.push('@context must include Multikey v1 context');
  }
  if (!doc.id) {
    errors.push('id is required');
  }
  if (!doc.verificationMethod || doc.verificationMethod.length === 0) {
    errors.push('at least one verificationMethod is required');
  } else {
    const vm = doc.verificationMethod[0];
    if (vm.type !== 'Multikey') {
      errors.push('verificationMethod type must be Multikey');
    }
    if (vm.controller !== doc.id) {
      errors.push('verificationMethod controller must match document id');
    }
    if (!vm.publicKeyMultibase || !vm.publicKeyMultibase.startsWith('z')) {
      errors.push('publicKeyMultibase must start with "z"');
    }
  }
  if (!doc.authentication || doc.authentication.length === 0) {
    errors.push('authentication is required');
  }

  return errors;
}

/**
 * Extract the messaging service endpoint from a DID Document.
 * @returns { type, endpoint } or null if no #dina-messaging service
 */
export function getMessagingService(doc: DIDDocument): { type: string; endpoint: string } | null {
  const svc = doc.service?.find(s => s.id === '#dina-messaging');
  if (!svc) return null;
  return { type: svc.type, endpoint: svc.serviceEndpoint };
}
