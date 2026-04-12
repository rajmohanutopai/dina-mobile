/**
 * W3C DID Document construction and validation.
 *
 * Structure matches server exactly:
 * - @context: ["https://www.w3.org/ns/did/v1"]
 * - verificationMethod: Ed25519VerificationKey2020 with publicKeyMultibase
 * - service: [{ id: "#dina-messaging", type: "DinaMsgBox", serviceEndpoint: "wss://..." }]
 * - authentication + assertionMethod reference the verification method
 *
 * Source: core/internal/adapter/identity/did_document.go
 */

export interface VerificationMethod {
  id: string;
  type: 'Ed25519VerificationKey2020';
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
  assertionMethod: string[];
  service: ServiceEndpoint[];
}

/**
 * Build a W3C DID Document from identity material.
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
  const vmId = `${did}#keys-1`;

  const doc: DIDDocument = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: did,
    verificationMethod: [
      {
        id: vmId,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase,
      },
    ],
    authentication: [vmId],
    assertionMethod: [vmId],
    service: [],
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

  if (!doc['@context'] || !doc['@context'].includes('https://www.w3.org/ns/did/v1')) {
    errors.push('@context must include W3C DID v1 context');
  }
  if (!doc.id) {
    errors.push('id is required');
  }
  if (!doc.verificationMethod || doc.verificationMethod.length === 0) {
    errors.push('at least one verificationMethod is required');
  } else {
    const vm = doc.verificationMethod[0];
    if (vm.type !== 'Ed25519VerificationKey2020') {
      errors.push('verificationMethod type must be Ed25519VerificationKey2020');
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
  if (!doc.assertionMethod || doc.assertionMethod.length === 0) {
    errors.push('assertionMethod is required');
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
