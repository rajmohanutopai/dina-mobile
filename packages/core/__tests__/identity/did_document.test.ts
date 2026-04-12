/**
 * T1C.2 — W3C DID Document construction and validation.
 *
 * Source: core/test/identity_test.go
 */

import {
  buildDIDDocument,
  validateDIDDocument,
  getMessagingService,
} from '../../src/identity/did_document';

describe('DID Document', () => {
  const did = 'did:plc:test123abc';
  const multibase = 'z6MkTestPublicKeyMultibase';
  const msgboxURL = 'wss://mailbox.dinakernel.com';

  describe('buildDIDDocument', () => {
    it('builds a valid DID Document', () => {
      const doc = buildDIDDocument(did, multibase, msgboxURL);
      expect(doc.id).toBe(did);
      expect(validateDIDDocument(doc)).toEqual([]);
    });

    it('builds document without service endpoint', () => {
      const doc = buildDIDDocument(did, multibase);
      expect(doc.service).toEqual([]);
    });
  });

  describe('document structure', () => {
    it('@context includes W3C DID v1', () => {
      const doc = buildDIDDocument(did, multibase, msgboxURL);
      expect(doc['@context']).toContain('https://www.w3.org/ns/did/v1');
    });

    it('id matches provided DID', () => {
      const doc = buildDIDDocument(did, multibase);
      expect(doc.id).toBe(did);
    });

    it('has exactly one verification method', () => {
      const doc = buildDIDDocument(did, multibase);
      expect(doc.verificationMethod).toHaveLength(1);
    });

    it('verification method type is Ed25519VerificationKey2020', () => {
      const doc = buildDIDDocument(did, multibase);
      expect(doc.verificationMethod[0].type).toBe('Ed25519VerificationKey2020');
    });

    it('verification method controller is the DID', () => {
      const doc = buildDIDDocument(did, multibase);
      expect(doc.verificationMethod[0].controller).toBe(did);
    });

    it('verification method publicKeyMultibase matches input', () => {
      const doc = buildDIDDocument(did, multibase);
      expect(doc.verificationMethod[0].publicKeyMultibase).toBe(multibase);
    });

    it('authentication references the verification method', () => {
      const doc = buildDIDDocument(did, multibase);
      expect(doc.authentication[0]).toBe(doc.verificationMethod[0].id);
    });

    it('assertionMethod references the verification method', () => {
      const doc = buildDIDDocument(did, multibase);
      expect(doc.assertionMethod[0]).toBe(doc.verificationMethod[0].id);
    });

    it('service has #dina-messaging with type DinaMsgBox', () => {
      const doc = buildDIDDocument(did, multibase, msgboxURL);
      const svc = doc.service.find(s => s.id === '#dina-messaging');
      expect(svc).toBeDefined();
      expect(svc!.type).toBe('DinaMsgBox');
    });

    it('service endpoint is the provided MsgBox URL', () => {
      const doc = buildDIDDocument(did, multibase, msgboxURL);
      expect(doc.service[0].serviceEndpoint).toBe(msgboxURL);
    });
  });

  describe('validateDIDDocument', () => {
    it('validates a well-formed document', () => {
      const doc = buildDIDDocument(did, multibase, msgboxURL);
      expect(validateDIDDocument(doc)).toEqual([]);
    });

    it('reports missing @context', () => {
      const doc = buildDIDDocument(did, multibase);
      doc['@context'] = [];
      const errors = validateDIDDocument(doc);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('getMessagingService', () => {
    it('extracts messaging service from document', () => {
      const doc = buildDIDDocument(did, multibase, msgboxURL);
      const svc = getMessagingService(doc);
      expect(svc).toEqual({ type: 'DinaMsgBox', endpoint: msgboxURL });
    });

    it('returns null when no messaging service', () => {
      const doc = buildDIDDocument(did, multibase);
      expect(getMessagingService(doc)).toBeNull();
    });
  });
});
