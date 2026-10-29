// Phone features: reminders, focus-timer alerts, backups, back button, haptics.
// Each call fails quietly in a desktop browser, so the app also runs there for testing.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import * as E from './engine.js';

export const isNative = Capacitor.isNativePlatform();

let hapticsOn = true;
export function setHapticsEnabled(v) { hapticsOn = v; }

// kind: light | medium | heavy | success | warning | long
export async function haptic(kind = 'light') {
  if (!isNative || !hapticsOn) return;
  try {
    if (kind === 'success') await Haptics.notification({ type: NotificationType.Success });
    else if (kind === 'warning') await Haptics.notification({ type: NotificationType.Warning });
    else if (kind === 'long') await Haptics.vibrate({ duration: 450 });
    else await Haptics.impact({ style: kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
  } catch {}
}
export const tap = () => haptic('light');

// ---------- screen time (native Usage Access) ----------
const ScreenTime = registerPlugin('ScreenTime');
const mockOn = () => { try { return localStorage.getItem('arkMockUsage') === '1'; } catch { return false; } };
// In a desktop browser there's no usage data; a test flag fakes some so the screens can be checked.
function mockUsage(from, to) {
  const hrs = Math.max(0, (to - from) / 3600000);
  const f = Math.min(1, hrs / 16);
  const base = [
    { pkg: 'com.instagram.android', label: 'Instagram', category: 4, m: 55 },
    { pkg: 'com.google.android.youtube', label: 'YouTube', category: 2, m: 70 },
    { pkg: 'com.whatsapp', label: 'WhatsApp', category: 4, m: 25 },
    { pkg: 'com.spotify.music', label: 'Spotify', category: 1, m: 40 },
    { pkg: 'com.supercell.clashroyale', label: 'Clash Royale', category: 0, m: 20 },
  ];
  return { apps: base.map((a) => ({ ...a, ms: Math.round(a.m * f * 60000) })), pickups: Math.round(60 * f) };
}
export async function screenPermission() {
  if (!isNative) return mockOn();
  try { return (await ScreenTime.hasPermission()).granted; } catch { return false; }
}
export async function openUsageSettings() {
  if (!isNative) { try { localStorage.setItem('arkMockUsage', '1'); } catch {} return; }
  try { await ScreenTime.openSettings(); } catch {}
}
export async function screenUsage(from, to) {
  if (!isNative) return mockOn() ? mockUsage(from, to) : { apps: [], pickups: 0 };
  try { return await ScreenTime.usage({ from, to }); } catch { return { apps: [], pickups: 0 }; }
}
export async function listApps() {
  if (!isNative) return mockUsage(0, 1).apps.map(({ pkg, label, category }) => ({ pkg, label, category }));
  try { return (await ScreenTime.apps()).apps; } catch { return []; }
}
export const CATEGORIES = [
  { key: 4, name: 'Social' }, { key: 2, name: 'Video' }, { key: 0, name: 'Games' },
  { key: 1, name: 'Music & audio' }, { key: 5, name: 'News' }, { key: 3, name: 'Photos' },
];

// ---------- fingerprint unlock ----------
const BioLock = registerPlugin('BioLock');
export async function bioAvailable() {
  if (!isNative) return false;
  try { return (await BioLock.isAvailable()).available; } catch { return false; }
}
export async function bioVerify(reason = 'Unlock Ark Mode') {
  if (!isNative) return false;
  try { return (await BioLock.verify({ reason })).verified; } catch { return false; }
}

// ---------- planner notifications ----------
const PLAN_BASE = 300;
let planIds = [];
export async function schedulePlan(state, blocksFor, blockRange) {
  if (!isNative) return;
  try {
    if (planIds.length) await LocalNotifications.cancel({ notifications: planIds.map((id) => ({ id })) });
    planIds = [];
    const ds = state.settings.dayStart ?? 3;
    const today = E.dayKey(Date.now(), ds);
    const list = [];
    for (let i = 0; i < 3; i++) {
      const day = E.addDays(today, i);
      blocksFor(state.plan, day, ds).forEach((b) => {
        const r = blockRange(b, day, ds);
        if (r.start <= Date.now() || list.length >= 90) return;
        list.push({ id: PLAN_BASE + list.length, title: `Now: ${b.title}`, body: `Planned until ${new Date(r.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`, schedule: { at: new Date(r.start), allowWhileIdle: true } });
      });
    }
    if (list.length) { await LocalNotifications.schedule({ notifications: list }); planIds = list.map((n) => n.id); }
  } catch (e) { console.warn('plan notify', e); }
}

// ---------- files (export) ----------
export async function shareFile(name, base64, mime) {
  if (!isNative) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'Downloaded.';
  }
  const res = await Filesystem.writeFile({ path: name, data: base64, directory: Directory.Cache });
  await Share.share({ title: name, files: [res.uri], dialogTitle: 'Save or send' });
  return 'Ready to save or send.';
}

// ---------- home-screen widget ----------
const WidgetBridge = registerPlugin('WidgetBridge');
let lastWidget = '';
export async function updateWidget(state, nowLine = '') {
  if (!isNative) return;
  const u = state.user;
  const ds = state.settings.dayStart ?? 3;
  const day = E.dayKey(Date.now(), ds);
  const due = state.tasks.filter((t) => E.isDue(t, day));
  const b = state.boss && state.boss.status === 'active' ? state.boss : null;
  const payload = {
    lvl: u.lvl,
    hp: Math.max(0, Math.round(u.hp)),
    hpMax: E.MAX_HP,
    exp: u.exp,
    expMax: E.toNextLevel(u.lvl),
    gold: (Math.floor(u.gp * 10) / 10).toFixed(1),
    dailiesLeft: due.filter((t) => !t.completed).length,
    dailiesTotal: due.length,
    day,
    dayStart: ds,
    rest: !!state.settings.restMode,
    hasBoss: !!b,
    bossName: b ? b.name : '',
    bossHp: b ? b.hp : 0,
    bossMax: b ? b.maxHp : 1,
    bossEnd: b ? b.end : '',
    nowLine,
    title: E.titleFor(u.lvl),
  };
  const key = JSON.stringify(payload);
  if (key === lastWidget) return;
  lastWidget = key;
  try { await WidgetBridge.update(payload); } catch (e) { console.warn('widget', e); }
}

export async function askNotificationPermission() {
  if (!isNative) return false;
  try {
    const p = await LocalNotifications.checkPermissions();
    if (p.display === 'granted') return true;
    const r = await LocalNotifications.requestPermissions();
    return r.display === 'granted';
  } catch { return false; }
}

const DAILY_IDS = [1, 2, 3, 4, 5, 6, 7, 8];
const FOCUS_ID = 100;

// Reminder at the chosen time for today (only if dailies are still open) and the next 7 days.
export async function scheduleReminders(state) {
  if (!isNative) return;
  try {
    await LocalNotifications.cancel({ notifications: DAILY_IDS.map((id) => ({ id })) });
    if (!state.settings.reminders || state.settings.restMode) return;
    const [hh, mm] = (state.settings.reminderTime || '22:00').split(':').map(Number);
    const ds = state.settings.dayStart ?? 3;
    const nowTs = Date.now();
    const todayKey = E.dayKey(nowTs, ds);
    const list = [];
    for (let i = 0; i < 8; i++) {
      const key = E.addDays(todayKey, i);
      const at = E.parseKey(key);
      at.setHours(hh, mm, 0, 0);
      if (hh < ds) at.setDate(at.getDate() + 1); // e.g. 1 AM belongs to the previous app-day
      if (at.getTime() <= nowTs) continue;
      const due = state.tasks.filter((t) => E.isDue(t, key));
      const open = i === 0 ? due.filter((t) => !t.completed) : due;
      if (!open.length) continue;
      list.push({
        id: DAILY_IDS[i],
        title: i === 0 ? `${open.length} ${open.length === 1 ? 'daily' : 'dailies'} still open` : `${open.length} ${open.length === 1 ? 'daily' : 'dailies'} due today`,
        body: `Tick them off before the ${ds} AM reset to keep your health.`,
        schedule: { at, allowWhileIdle: true },
      });
    }
    if (list.length) await LocalNotifications.schedule({ notifications: list });
  } catch (e) { console.warn('reminders', e); }
}

export async function scheduleFocusEnd(running) {
  if (!isNative) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: FOCUS_ID }] });
    if (!running) return;
    const at = new Date(running.start + running.minutes * 60000);
    await LocalNotifications.schedule({
      notifications: [{
        id: FOCUS_ID,
        title: running.kind === 'break' ? 'Break over' : 'Focus session done',
        body: running.kind === 'break' ? 'Back to it.' : `${running.minutes} minutes done. Open the app to log it.`,
        schedule: { at, allowWhileIdle: true },
      }],
    });
  } catch (e) { console.warn('focus notify', e); }
}

export async function shareBackup(json) {
  const name = `arkmode-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (!isNative) {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'Backup downloaded.';
  }
  const res = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: 'Ark Mode backup', files: [res.uri], dialogTitle: 'Save your backup' });
  return 'Backup ready to save.';
}
