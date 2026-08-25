/**
 * Consent state for the two checkboxes required by the project review notes
 * (item 7, Data Privacy):
 *
 *   1. accepting the terms of use, mandatory, gates access to the system
 *   2. allowing uploads to be used for dataset / model development, optional
 *
 * The dialog is shown on every entry to the system, so nothing here decides
 * whether to prompt; the stored value only pre-fills the optional checkbox
 * with the answer given last time, and lets upload code read the current
 * answer. Consent is not persisted to the backend yet.
 */

const DATA_CONSENT_KEY = 'pdinsight_data_consent';
const TERMS_VERSION_KEY = 'pdinsight_terms_version';

/** Bump when the wording of the terms changes materially. */
export const TERMS_VERSION = '2026-08';

export interface ConsentRecord {
  /** Terms of use accepted for TERMS_VERSION. */
  terms: boolean;
  /** Uploads may be reused to improve the dataset and models. */
  data: boolean;
  /** ISO timestamp of the answer. */
  at: string;
}

export function getDataConsent(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(DATA_CONSENT_KEY) === 'true';
}

export function getAcceptedTermsVersion(): string | null {
  if (typeof window === 'undefined') return null;
  return (window.localStorage.getItem(TERMS_VERSION_KEY) ?? '').split('|')[0] || null;
}

/** Local calendar date, e.g. "2026-08-25" — the gate re-prompts once this rolls over. */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** True once the current terms version has been accepted earlier today. */
export function getAcceptedTermsToday(): boolean {
  if (typeof window === 'undefined') return false;
  const [version, date] = (window.localStorage.getItem(TERMS_VERSION_KEY) ?? '').split('|');
  return version === TERMS_VERSION && date === todayStr();
}

export function recordConsent(terms: boolean, data: boolean): ConsentRecord {
  const record: ConsentRecord = { terms, data, at: new Date().toISOString() };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DATA_CONSENT_KEY, String(data));
    if (terms) window.localStorage.setItem(TERMS_VERSION_KEY, `${TERMS_VERSION}|${todayStr()}`);
  }
  return record;
}
