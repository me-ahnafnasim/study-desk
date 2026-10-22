import GLib from 'gi://GLib';

import {readText} from './utils.js';

// GNOME's screen-time record: a list of {oldState, newState, wallTimeSecs} session transitions.
const HISTORY = GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-shell', 'session-active-history.json']);
const ACTIVE = 1;

export async function readHistory(cancellable) {
    const history = JSON.parse(await readText(HISTORY, cancellable));
    return history.sort((a, b) => a.wallTimeSecs - b.wallTimeSecs);
}

// [start, end] spans (Unix seconds) when the session was active, the last one running until `now`.
export function activeSpans(history, now) {
    const spans = [];
    let since = null;
    for (const {newState, wallTimeSecs: t} of history) {
        if (newState === ACTIVE && since === null)
            since = t;
        else if (newState !== ACTIVE && since !== null) {
            spans.push([since, t]);
            since = null;
        }
    }
    if (since !== null)
        spans.push([since, now]);
    return spans;
}

export function localMidnight(daysAgo = 0) {
    const now = GLib.DateTime.new_now_local().add_days(-daysAgo);
    return GLib.DateTime.new_local(now.get_year(), now.get_month(), now.get_day_of_month(), 0, 0, 0);
}

// Seconds of activity per hour of today (index 23 also absorbs the extra hour of a 25-hour DST day).
export function hourlyUsage(spans, now) {
    const start = localMidnight().to_unix();
    const hours = new Array(24).fill(0);
    for (const [a, b] of spans) {
        for (let t = Math.max(a, start), end = Math.min(b, now); t < end;) {
            const h = Math.min(23, Math.floor((t - start) / 3600));
            const next = h === 23 ? end : Math.min(end, start + (h + 1) * 3600);
            hours[h] += next - t;
            t = next;
        }
    }
    return hours;
}

// The longest inactive stretch between 8 PM the evening before `wakeDay` and 2 PM on it, if it is
// at least `minHours` long: a stand-in for sleep on a machine with no sleep sensor.
export function estimateSleep(spans, history, wakeDay, now, minHours = 3) {
    const from = wakeDay.add_hours(-4).to_unix();
    const to = Math.min(wakeDay.add_hours(14).to_unix(), now);
    if (!history.length || history[0].wallTimeSecs > from || to <= from)
        return null; // history doesn't cover this night
    let best = null, cursor = from;
    const gaps = [];
    for (const [a, b] of spans) {
        if (b <= from || a >= to)
            continue;
        if (a > cursor)
            gaps.push([cursor, a]);
        cursor = Math.max(cursor, b);
    }
    if (cursor < to && to < now)
        gaps.push([cursor, to]); // still asleep at 2 PM; only counts once that time has passed
    for (const gap of gaps) {
        if (gap[1] - gap[0] >= minHours * 3600 && (!best || gap[1] - gap[0] > best[1] - best[0]))
            best = gap;
    }
    return best;
}
