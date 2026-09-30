import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Tests for src/lib/i18n.js — the runtime language override that
// chrome.i18n cannot provide (getMessage is hard-bound to the browser UI
// language, so the preference is honored by loading _locales catalogs).

const CATALOGS = {
  en: {
    hello: { message: 'Hello $1' },
    onlyEn: { message: 'Only English' },
  },
  fr: {
    hello: { message: 'Bonjour $1' },
  },
  de: {
    hello: { message: 'Hallo $1' },
  },
};

function makeBrowser({ uiLanguage = 'en-US', preference } = {}) {
  const stored =
    preference === undefined
      ? {}
      : { ZabbixServers: JSON.stringify({ global: { language: preference } }) };
  return {
    i18n: {
      getUILanguage: () => uiLanguage,
      getMessage: (key) => `[platform:${key}]`,
    },
    runtime: {
      getURL: (p) => `chrome-extension://ext-id/${p}`,
    },
    storage: {
      local: { get: async () => stored },
    },
  };
}

function mockFetch() {
  return vi.fn(async (url) => {
    const m = /_locales\/([^/]+)\/messages\.json/.exec(url);
    const catalog = m && CATALOGS[m[1]];
    if (!catalog) return { ok: false };
    return { ok: true, json: async () => catalog };
  });
}

describe('i18n', () => {
  let origBrowser;
  let origChrome;
  let origFetch;

  beforeEach(() => {
    vi.resetModules();
    origBrowser = globalThis.browser;
    origChrome = globalThis.chrome;
    origFetch = globalThis.fetch;
    delete globalThis.browser;
    delete globalThis.chrome;
  });

  afterEach(() => {
    if (origBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = origBrowser;
    if (origChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = origChrome;
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  async function loadI18n(browserOpts) {
    globalThis.chrome = makeBrowser(browserOpts);
    globalThis.fetch = mockFetch();
    return import('../i18n.js');
  }

  it('defaults to the browser UI language (mapped to a _locales dir)', async () => {
    const { initI18n, t } = await loadI18n({ uiLanguage: 'fr' });
    await initI18n();
    expect(t('hello', 'Marc')).toBe('Bonjour Marc');
  });

  it('maps BCP 47 tags like pt-BR onto _locales directory names', async () => {
    // pt_BR is not in the mocked catalogs; the point is the resolved locale
    // drives the fetch URL, falling back to English for missing keys.
    const { initI18n, t } = await loadI18n({ uiLanguage: 'pt-BR' });
    const fetchMock = globalThis.fetch;
    await initI18n();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('_locales/pt_BR/messages.json')
    );
    expect(t('onlyEn')).toBe('Only English');
  });

  it('honors an explicit language preference over the UI language', async () => {
    const { initI18n, t } = await loadI18n({ uiLanguage: 'fr', preference: 'de' });
    await initI18n();
    expect(t('hello', 'Anna')).toBe('Hallo Anna');
  });

  it('falls back to English for keys missing in the selected locale', async () => {
    const { initI18n, t } = await loadI18n({ uiLanguage: 'fr' });
    await initI18n();
    expect(t('onlyEn')).toBe('Only English');
  });

  it('falls back to English for an unrecognized UI language', async () => {
    const { initI18n, t } = await loadI18n({ uiLanguage: 'xx-YY' });
    await initI18n();
    expect(t('hello', 'Bob')).toBe('Hello Bob');
  });

  it('coerces an unknown stored preference to the default', async () => {
    const { initI18n, t, normalizeLanguagePreference } = await loadI18n({
      uiLanguage: 'de',
      preference: 'klingon',
    });
    expect(normalizeLanguagePreference('klingon')).toBe('default');
    await initI18n();
    expect(t('hello', 'Kirk')).toBe('Hallo Kirk');
  });

  it('degrades to the platform getMessage when catalogs fail to load', async () => {
    globalThis.chrome = makeBrowser({ uiLanguage: 'fr' });
    globalThis.fetch = vi.fn(async () => ({ ok: false }));
    const { initI18n, t } = await import('../i18n.js');
    await initI18n();
    expect(t('hello')).toBe('[platform:hello]');
  });

  it('refreshI18n picks up a changed preference', async () => {
    const mod = await loadI18n({ uiLanguage: 'en-US', preference: 'fr' });
    await mod.initI18n();
    expect(mod.t('hello', 'Zoe')).toBe('Bonjour Zoe');

    // Simulate the user picking German in options and saving: storage now
    // returns the new preference (the shim holds the same chrome object).
    globalThis.chrome.storage.local.get = async () => ({
      ZabbixServers: JSON.stringify({ global: { language: 'de' } }),
    });
    await mod.refreshI18n();
    expect(mod.t('hello', 'Zoe')).toBe('Hallo Zoe');
  });

  it('AVAILABLE_LOCALES covers every _locales directory', async () => {
    const { AVAILABLE_LOCALES } = await loadI18n();
    const dir = path.resolve('src/public/_locales');
    const onDisk = fs
      .readdirSync(dir)
      .filter((f) => fs.statSync(path.join(dir, f)).isDirectory());
    const codes = new Set(AVAILABLE_LOCALES.map((l) => l.code));
    for (const d of onDisk) {
      expect(codes.has(d)).toBe(true);
    }
    expect(AVAILABLE_LOCALES.length).toBe(onDisk.length);
  });
});
