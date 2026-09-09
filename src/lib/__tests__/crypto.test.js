import { describe, it, expect, beforeAll } from 'vitest';

// Set navigator properties before importing crypto.js (which reads them at
// module level). In a real browser these are always present; Node leaves
// appName undefined.
if (!navigator.appName) {
  Object.defineProperty(navigator, 'appName', { value: 'Netscape', configurable: true });
}

import { encryptSettingKeys, decryptSettings } from '../crypto.js';
import { sjcl } from '../sjcl.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a legacy sjcl-encrypted string (v1 format) the way the old
 * crypto.js used to produce them.
 */
function legacyEncrypt(plaintext) {
  const pass = navigator.appName + navigator.language + navigator.platform;
  const salt = sjcl.codec.base64.fromBits(
    sjcl.hash.sha256.hash(navigator.appName)
  );
  const decoderRing = sjcl.codec.hex.fromBits(sjcl.misc.pbkdf2(pass, salt));
  return sjcl.encrypt(decoderRing, plaintext);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('crypto.js — Web Crypto API', () => {
  describe('encrypt → decrypt roundtrip', () => {
    it('roundtrips a normal string', async () => {
      const original = 'my-secret-password-123!';
      const settings = {
        servers: [{ apiToken: original, pass: original }],
      };
      const encrypted = await encryptSettingKeys(structuredClone(settings));

      // Encrypted values should be JSON strings, not plaintext
      expect(encrypted.servers[0].apiToken).not.toBe(original);
      expect(encrypted.servers[0].pass).not.toBe(original);

      // Verify v2 format marker
      const parsed = JSON.parse(encrypted.servers[0].apiToken);
      expect(parsed.v).toBe(2);
      expect(parsed.alg).toBe('AES-GCM');
      expect(parsed.iv).toBeDefined();
      expect(parsed.ct).toBeDefined();

      // Decrypt and verify
      const decryptedToken = await decryptSettings(
        encrypted.servers[0].apiToken
      );
      const decryptedPass = await decryptSettings(encrypted.servers[0].pass);
      expect(decryptedToken).toBe(original);
      expect(decryptedPass).toBe(original);
    });

    it('produces different ciphertexts for the same plaintext (random IV)', async () => {
      const settings1 = {
        servers: [{ apiToken: 'same-value', pass: 'same-value' }],
      };
      const settings2 = {
        servers: [{ apiToken: 'same-value', pass: 'same-value' }],
      };
      const enc1 = await encryptSettingKeys(structuredClone(settings1));
      const enc2 = await encryptSettingKeys(structuredClone(settings2));

      // Different IVs → different ciphertext
      expect(enc1.servers[0].apiToken).not.toBe(enc2.servers[0].apiToken);
    });

    it('roundtrips an empty string', async () => {
      const settings = {
        servers: [{ apiToken: '', pass: '' }],
      };
      const encrypted = await encryptSettingKeys(structuredClone(settings));
      const decryptedToken = await decryptSettings(
        encrypted.servers[0].apiToken
      );
      const decryptedPass = await decryptSettings(encrypted.servers[0].pass);
      expect(decryptedToken).toBe('');
      expect(decryptedPass).toBe('');
    });

    it('handles unicode and special characters', async () => {
      const special = 'pässwörd-日本語-🔐';
      const settings = {
        servers: [{ apiToken: special, pass: special }],
      };
      const encrypted = await encryptSettingKeys(structuredClone(settings));
      const decrypted = await decryptSettings(encrypted.servers[0].apiToken);
      expect(decrypted).toBe(special);
    });
  });

  describe('multiple servers', () => {
    it('encrypts and decrypts each server independently', async () => {
      const settings = {
        servers: [
          { apiToken: 'token-A', pass: 'pass-A' },
          { apiToken: 'token-B', pass: 'pass-B' },
          { apiToken: '', pass: 'pass-C' },
        ],
      };
      const encrypted = await encryptSettingKeys(structuredClone(settings));

      expect(await decryptSettings(encrypted.servers[0].apiToken)).toBe(
        'token-A'
      );
      expect(await decryptSettings(encrypted.servers[0].pass)).toBe('pass-A');
      expect(await decryptSettings(encrypted.servers[1].apiToken)).toBe(
        'token-B'
      );
      expect(await decryptSettings(encrypted.servers[1].pass)).toBe('pass-B');
      expect(await decryptSettings(encrypted.servers[2].apiToken)).toBe('');
      expect(await decryptSettings(encrypted.servers[2].pass)).toBe('pass-C');
    });
  });

  describe('legacy sjcl migration', () => {
    it('decrypts a legacy sjcl-encrypted value (v1 format)', async () => {
      const original = 'legacy-password-456';
      const legacyCiphertext = legacyEncrypt(original);

      // Verify it looks like sjcl format
      const parsed = JSON.parse(legacyCiphertext);
      expect(parsed.cipher).toBe('aes');
      expect(parsed.mode).toBe('ccm');
      expect(parsed.v).toBe(1);

      // decryptSettings should transparently handle it
      const decrypted = await decryptSettings(legacyCiphertext);
      expect(decrypted).toBe(original);
    });

    it('re-encrypts legacy data in v2 format after roundtrip', async () => {
      const original = 'migrate-me';
      const legacyCiphertext = legacyEncrypt(original);

      // Simulate what options.vue does: decrypt old, then re-encrypt
      const decrypted = await decryptSettings(legacyCiphertext);
      expect(decrypted).toBe(original);

      const settings = {
        servers: [{ apiToken: decrypted, pass: decrypted }],
      };
      const reEncrypted = await encryptSettingKeys(structuredClone(settings));

      // Now it should be v2 format
      const parsed = JSON.parse(reEncrypted.servers[0].apiToken);
      expect(parsed.v).toBe(2);
      expect(parsed.alg).toBe('AES-GCM');

      // And still decrypts correctly
      const final = await decryptSettings(reEncrypted.servers[0].apiToken);
      expect(final).toBe(original);
    });
  });

  describe('edge cases', () => {
    it('returns empty string for null/undefined/empty input', async () => {
      expect(await decryptSettings('')).toBe('');
      expect(await decryptSettings(null)).toBe('');
      expect(await decryptSettings(undefined)).toBe('');
      expect(await decryptSettings('""')).toBe('');
    });

    it('throws on unknown format', async () => {
      const badData = JSON.stringify({ v: 99, foo: 'bar' });
      await expect(decryptSettings(badData)).rejects.toThrow(
        'Unknown encryption format'
      );
    });

    it('handles long strings', async () => {
      const longStr = 'x'.repeat(10000);
      const settings = {
        servers: [{ apiToken: longStr, pass: longStr }],
      };
      const encrypted = await encryptSettingKeys(structuredClone(settings));
      const decrypted = await decryptSettings(encrypted.servers[0].apiToken);
      expect(decrypted).toBe(longStr);
    });
  });
});
