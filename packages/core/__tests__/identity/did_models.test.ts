/**
 * T1L.3 — W3C DID Document model: field aliasing, serialization, roundtrip.
 *
 * Category A: fixture-based. Cross-language verification against
 * tests/test_did_models.py.
 *
 * Source: tests/test_did_models.py
 */

import { serializeDIDDocument, deserializeDIDDocument, verifyJsonRoundtrip } from '../../src/identity/did_models';
import type { DIDDocument } from '../../src/identity/did_document';

describe('DID Document Models (Python vectors)', () => {
  const testDoc: DIDDocument = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: 'did:key:z6MkTest123',
    verificationMethod: [{
      id: 'did:key:z6MkTest123#signing-0',
      type: 'Ed25519VerificationKey2020',
      controller: 'did:key:z6MkTest123',
      publicKeyMultibase: 'z6MkTestMultibase',
    }],
    authentication: ['did:key:z6MkTest123#signing-0'],
    assertionMethod: ['did:key:z6MkTest123#signing-0'],
    service: [],
  };

  describe('serialization', () => {
    it('uses camelCase publicKeyMultibase (not snake_case)', () => {
      const json = serializeDIDDocument(testDoc);
      expect(json).toContain('publicKeyMultibase');
      expect(json).not.toContain('public_key_multibase');
    });

    it('uses @context (not context)', () => {
      const json = serializeDIDDocument(testDoc);
      expect(json).toContain('"@context"');
    });

    it('uses camelCase verificationMethod', () => {
      const json = serializeDIDDocument(testDoc);
      expect(json).toContain('verificationMethod');
      expect(json).not.toContain('verification_method');
    });

    it('uses camelCase assertionMethod', () => {
      const json = serializeDIDDocument(testDoc);
      expect(json).toContain('assertionMethod');
      expect(json).not.toContain('assertion_method');
    });

    it('produces valid JSON', () => {
      const json = serializeDIDDocument(testDoc);
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe('deserialization', () => {
    it('accepts camelCase JSON', () => {
      const json = JSON.stringify(testDoc);
      const doc = deserializeDIDDocument(json);
      expect(doc.id).toBe('did:key:z6MkTest123');
      expect(doc.verificationMethod[0].publicKeyMultibase).toBe('z6MkTestMultibase');
    });

    it('accepts snake_case aliases', () => {
      const snakeCase = JSON.stringify({
        '@context': testDoc['@context'],
        id: testDoc.id,
        verification_method: testDoc.verificationMethod.map(vm => ({
          ...vm,
          public_key_multibase: vm.publicKeyMultibase,
        })),
        authentication: testDoc.authentication,
        assertion_method: testDoc.assertionMethod,
        service: testDoc.service,
      });
      const doc = deserializeDIDDocument(snakeCase);
      expect(doc.verificationMethod[0].publicKeyMultibase).toBe('z6MkTestMultibase');
      expect(doc.assertionMethod).toEqual(testDoc.assertionMethod);
    });

    it('supports multiple verification methods', () => {
      const multiVM = {
        ...testDoc,
        verificationMethod: [
          testDoc.verificationMethod[0],
          { ...testDoc.verificationMethod[0], id: 'did:key:z6MkTest123#signing-1' },
        ],
      };
      const doc = deserializeDIDDocument(JSON.stringify(multiVM));
      expect(doc.verificationMethod).toHaveLength(2);
      expect(doc.verificationMethod[1].id).toBe('did:key:z6MkTest123#signing-1');
    });

    it('defaults @context to W3C DID v1 when missing', () => {
      const noContext = { id: 'did:key:z6MkTest', verificationMethod: [], authentication: [], assertionMethod: [], service: [] };
      const doc = deserializeDIDDocument(JSON.stringify(noContext));
      expect(doc['@context']).toContain('https://www.w3.org/ns/did/v1');
    });
  });

  describe('JSON roundtrip', () => {
    it('serialize → deserialize → serialize produces identical output', () => {
      expect(verifyJsonRoundtrip(testDoc)).toBe(true);
    });

    it('roundtrip preserves all fields', () => {
      const json1 = serializeDIDDocument(testDoc);
      const doc = deserializeDIDDocument(json1);
      const json2 = serializeDIDDocument(doc);
      expect(json1).toBe(json2);
    });
  });
});
