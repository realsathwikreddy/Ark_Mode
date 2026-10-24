// Phone features: reminders, focus-timer alerts, backups, back button, haptics.
// Each call fails quietly in a desktop browser, so the app also runs there for testing.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import * as E from './engine.js';

export const isNative = Capacitor.isNativePlatform();

export async function tap() {
  if (!isNative) return;
  try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
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
  const name = `questline-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (!isNative) {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'Backup downloaded.';
  }
  const res = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: 'Questline backup', files: [res.uri], dialogTitle: 'Save your backup' });
  return 'Backup ready to save.';
}
