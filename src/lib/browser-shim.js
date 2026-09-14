/**
 * Minimal replacement for webextension-polyfill (removed in 799871b;
 * see issue #122 — its absence crashed the extension in Chrome).
 *
 * Firefox exposes a native promise-based `browser` namespace; Chrome MV3
 * only exposes `chrome` (which is natively promise-based for every API this
 * extension uses: storage, alarms, notifications, action, tabs, offscreen,
 * runtime, i18n). So a namespace alias is all that's needed — no API
 * wrapping. Import { browser } wherever the extension APIs are used; the
 * side-effect-only import form is NOT used because this repo's build drops
 * such imports from the popup/options bundles.
 */
export const browser = globalThis.browser ?? globalThis.chrome;
