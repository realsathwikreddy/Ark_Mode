// Over-the-air updates. Most updates only change the app's screens and code, so they
// download in the background and apply next time Ark Mode opens. Changes to the native
// Android parts still need a new APK; then the app shows a one-tap install.
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Browser } from '@capacitor/browser';
import { isNative } from './native.js';

export const BASE = 'https://raw.githubusercontent.com/realsathwikreddy/Ark_Mode_Updates/main/';
export const WEB_VERSION = typeof __WEB_VERSION__ !== 'undefined' ? __WEB_VERSION__ : 0;
export const NATIVE_VERSION = typeof __NATIVE_VERSION__ !== 'undefined' ? __NATIVE_VERSION__ : 0;

// Tell the updater this bundle started fine; otherwise it rolls back to the last good one.
export async function appReady() {
  if (!isNative) return;
  try { await CapacitorUpdater.notifyAppReady(); } catch {}
}

export async function fetchJson(name) {
  const r = await fetch(`${BASE}${name}?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return r.json();
}

let busy = false;
// Returns { kind: 'none' | 'web-ready' | 'apk', ... }
export async function checkForUpdate() {
  if (busy) return { kind: 'busy' };
  busy = true;
  try {
    const v = await fetchJson('version.json');
    if ((v.minNative || 0) > NATIVE_VERSION) {
      return { kind: 'apk', url: v.apkUrl || `${BASE}ArkMode.apk`, notes: v.notes || '', web: v.web };
    }
    if (v.web > WEB_VERSION && isNative) {
      try {
        const cur = await CapacitorUpdater.current();
        if (cur?.bundle?.version === String(v.web)) return { kind: 'none' };
      } catch {}
      if (!v.bundleSha256) throw new Error('The update is missing its checksum.');
      const bundle = await CapacitorUpdater.download({ url: v.bundleUrl || `${BASE}bundles/web-${v.web}.zip`, version: String(v.web), checksum: v.bundleSha256 });
      await CapacitorUpdater.next({ id: bundle.id });
      return { kind: 'web-ready', id: bundle.id, web: v.web, notes: v.notes || '' };
    }
    return { kind: 'none', web: v.web };
  } finally {
    busy = false;
  }
}

export async function applyNow(id) {
  if (!isNative) { location.reload(); return; }
  await CapacitorUpdater.set({ id });
}

export async function openLink(url) {
  if (!isNative) { window.open(url, '_blank', 'noopener'); return; }
  try { await Browser.open({ url }); } catch { window.open(url, '_system'); }
}
