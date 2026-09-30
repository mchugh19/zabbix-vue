import { browser } from './browser-shim.js'; // Chrome: aliases globalThis.chrome (no-op in Firefox)

/*
 * Runtime i18n with a user-selectable language.
 *
 * chrome.i18n.getMessage() is hard-bound to the browser UI language with no
 * override API, so a language preference needs its own lookup. This module
 * reads the standard _locales/<locale>/messages.json catalogs at runtime and
 * exposes t(), a synchronous drop-in replacement for getMessage with the
 * same (key, substitutions) signature.
 *
 * Preference storage: settings.global.language inside the "ZabbixServers"
 * blob ("default" = follow the browser UI language). Fallback chain for a
 * missing key: selected locale -> "en" (manifest default_locale) ->
 * browser.i18n.getMessage -> the key itself.
 */

// "Follow the browser UI language" — the default preference value.
export const DEFAULT_LANGUAGE = 'default';
// Manifest default_locale; final fallback for missing keys.
export const FALLBACK_LOCALE = 'en';

// Native names for the options dropdown. Deliberately not translated: they
// are proper nouns and the list must stay readable in any active locale.
// Must cover every directory under src/public/_locales (see i18n.test.js).
export const AVAILABLE_LOCALES = [
  { code: 'cs', name: 'Čeština' },
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'hu', name: 'Magyar' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'pt_BR', name: 'Português (Brasil)' },
  { code: 'pt_PT', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'uk', name: 'Українська' },
  { code: 'zh_CN', name: '中文 (简体)' },
];

const LOCALE_CODES = new Set(AVAILABLE_LOCALES.map((l) => l.code));

// Loaded catalogs: locale -> parsed messages.json. Module state persists for
// the lifetime of the context (page, popup, or service worker).
let catalogs = {};
let activeLocale = null;
let initPromise = null;

// Map a BCP 47 tag from getUILanguage() (e.g. "pt-BR", "zh-CN") onto a
// _locales directory name (e.g. "pt_BR", "zh_CN").
function matchLocale(tag) {
  if (!tag || typeof tag !== 'string') return FALLBACK_LOCALE;
  const underscored = tag.replace(/-/g, '_');
  if (LOCALE_CODES.has(underscored)) return underscored;
  const base = tag.split(/[-_]/)[0];
  if (LOCALE_CODES.has(base)) return base;
  return FALLBACK_LOCALE;
}

function uiLocale() {
  try {
    if (browser.i18n && typeof browser.i18n.getUILanguage === 'function') {
      return matchLocale(browser.i18n.getUILanguage());
    }
  } catch (_) { /* fall through to default */ }
  return FALLBACK_LOCALE;
}

async function loadCatalog(locale) {
  if (!catalogs[locale]) {
    const url = browser.runtime.getURL(`_locales/${locale}/messages.json`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`i18n: failed to load catalog ${locale}`);
    catalogs[locale] = await response.json();
  }
  return catalogs[locale];
}

// Accept a stored preference, coercing unknown/missing values to the default.
export function normalizeLanguagePreference(value) {
  return LOCALE_CODES.has(value) ? value : DEFAULT_LANGUAGE;
}

async function readLanguagePreference() {
  try {
    const stored = await browser.storage.local.get('ZabbixServers');
    const blob = stored && stored.ZabbixServers;
    if (!blob) return DEFAULT_LANGUAGE;
    const settings = JSON.parse(blob);
    const lang = settings && settings.global && settings.global.language;
    return normalizeLanguagePreference(lang);
  } catch (_) {
    return DEFAULT_LANGUAGE;
  }
}

async function load() {
  const preference = await readLanguagePreference();
  activeLocale = preference === DEFAULT_LANGUAGE ? uiLocale() : preference;
  // Best effort: a failed fetch leaves the catalog empty and t() degrades to
  // the platform getMessage, i.e. the pre-override behavior.
  try { await loadCatalog(activeLocale); } catch (_) { /* fall through */ }
  if (activeLocale !== FALLBACK_LOCALE) {
    try { await loadCatalog(FALLBACK_LOCALE); } catch (_) { /* fall through */ }
  }
  return activeLocale;
}

// Idempotent: safe to call from every entry point; concurrent callers share
// the in-flight load. Must resolve before the first t() call that should
// honor the preference.
export function initI18n() {
  if (!initPromise) initPromise = load();
  return initPromise;
}

// Drop cached catalogs and re-read the preference (options save path).
export function refreshI18n() {
  initPromise = null;
  catalogs = {};
  activeLocale = null;
  return initI18n();
}

function lookup(key) {
  const chain = activeLocale ? [activeLocale] : [];
  if (activeLocale !== FALLBACK_LOCALE) chain.push(FALLBACK_LOCALE);
  for (const locale of chain) {
    const entry = catalogs[locale] && catalogs[locale][key];
    if (entry && typeof entry.message === 'string') return entry.message;
  }
  return null;
}

function applySubstitutions(message, substitutions) {
  if (substitutions === undefined || substitutions === null) return message;
  const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
  return message.replace(/\$([1-9])/g, (m, n) => {
    const i = Number(n) - 1;
    return i < subs.length && subs[i] !== undefined ? String(subs[i]) : m;
  });
}

/*
 * Synchronous message lookup with the getMessage(key, substitutions)
 * signature. Catalogs must be preloaded via initI18n(); before that (or when
 * a catalog failed to load) it delegates to the platform implementation.
 */
export function t(key, substitutions) {
  const message = lookup(key);
  if (message === null) {
    try {
      return browser.i18n.getMessage(key, substitutions) || key;
    } catch (_) {
      return key;
    }
  }
  return applySubstitutions(message, substitutions);
}
