import { sjcl } from './sjcl.js';

// --- Key derivation (same deterministic inputs as legacy for compatibility) ---
const passphrase = navigator.appName + navigator.language + navigator.platform;
const encoder = new TextEncoder();

/**
 * Derive an AES-GCM CryptoKey from the browser-fingerprint passphrase
 * using PBKDF2 with a SHA-256 salt.
 */
async function deriveKey() {
  const salt = encoder.encode(navigator.appName);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Lazily cached key promise (derived once per module load)
let _keyPromise = null;
function getKey() {
  if (!_keyPromise) {
    _keyPromise = deriveKey();
  }
  return _keyPromise;
}

// --- Encrypt (AES-GCM, random 12-byte IV) ---

async function encrypt(plaintext) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );
  return JSON.stringify({
    v: 2,
    alg: 'AES-GCM',
    iv: bufToBase64(iv),
    ct: bufToBase64(new Uint8Array(ciphertext)),
  });
}

// --- Decrypt (auto-detects format version) ---

async function decrypt(encryptedData) {
  if (!encryptedData || encryptedData === '""' || encryptedData === '') {
    return '';
  }

  let parsed;
  try {
    parsed = JSON.parse(encryptedData);
  } catch {
    return '';
  }

  // New format (v2): Web Crypto AES-GCM
  if (parsed.v === 2 && parsed.alg === 'AES-GCM') {
    const key = await getKey();
    const iv = base64ToBuf(parsed.iv);
    const ct = base64ToBuf(parsed.ct);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ct
    );
    return new TextDecoder().decode(decrypted);
  }

  // Legacy format (v1): sjcl AES-CCM — fall back for migration
  if (parsed.cipher === 'aes' && parsed.mode === 'ccm') {
    return decryptLegacy(encryptedData);
  }

  throw new Error('Unknown encryption format');
}

// --- Legacy sjcl decryption (kept for migration from v1 → v2) ---

function decryptLegacy(encryptedData) {
  const pass = navigator.appName + navigator.language + navigator.platform;
  const salt = sjcl.codec.base64.fromBits(sjcl.hash.sha256.hash(navigator.appName));
  const decoderRing = sjcl.codec.hex.fromBits(sjcl.misc.pbkdf2(pass, salt));
  return sjcl.decrypt(decoderRing, encryptedData);
}

// --- Base64 helpers ---

function bufToBase64(buf) {
  let binary = '';
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  return btoa(binary);
}

function base64ToBuf(b64) {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buf[i] = binary.charCodeAt(i);
  }
  return buf;
}

// --- Public API (same signatures as before, now async) ---

const encryptSettingKeys = async (settings) => {
  /*
   * Given full settings object, walk servers, and encrypt the apiToken and password fields.
   * Returns settings object with encrypted fields.
   */
  for (const serverIndex in settings['servers']) {
    settings.servers[serverIndex].apiToken = await encrypt(settings.servers[serverIndex].apiToken);
    settings.servers[serverIndex].pass = await encrypt(settings.servers[serverIndex].pass);
  }
  return settings;
};

const decryptSettings = async (encryptedData) => {
  return decrypt(encryptedData);
};

export { encryptSettingKeys, decryptSettings };

/**
 * Check if an encrypted string is in the legacy sjcl format.
 * Used by migration code to detect settings that need re-encryption.
 */
export function isLegacyFormat(encryptedData) {
  if (!encryptedData || encryptedData === '""' || encryptedData === '') {
    return false;
  }
  try {
    const parsed = JSON.parse(encryptedData);
    return parsed.cipher === 'aes' && parsed.mode === 'ccm';
  } catch {
    return false;
  }
}
