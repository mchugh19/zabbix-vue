import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression test for issue #122: dropping webextension-polyfill left the
// bare `browser` global undefined in Chrome (only Firefox has it natively),
// crashing background/popup/options. The suite never caught it because every
// test file mocks globalThis.browser (i.e. simulates Firefox, never Chrome).
describe('browser-shim', () => {
  let origBrowser;
  let origChrome;

  beforeEach(() => {
    vi.resetModules();
    origBrowser = globalThis.browser;
    origChrome = globalThis.chrome;
    delete globalThis.browser;
    delete globalThis.chrome;
  });

  afterEach(() => {
    if (origBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = origBrowser;
    if (origChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = origChrome;
  });

  it('aliases chrome when browser is absent (Chrome)', async () => {
    const fakeChrome = { runtime: {}, i18n: { getMessage: (k) => k } };
    globalThis.chrome = fakeChrome;

    const { browser } = await import('../browser-shim.js');

    expect(browser).toBe(fakeChrome);
  });

  it('prefers the native browser namespace when present (Firefox)', async () => {
    const fakeBrowser = { runtime: { id: 'firefox-native' } };
    globalThis.browser = fakeBrowser;
    globalThis.chrome = { runtime: {} };

    const { browser } = await import('../browser-shim.js');

    expect(browser).toBe(fakeBrowser);
  });
});
