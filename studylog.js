import {parseJson, todayKey} from './ui.js';

const KEEP_DAYS = 400;

// Minutes of completed focus per day, stored in the settings so every widget sees the same record.
export function readLog(settings) {
    return parseJson(settings, 'study-log', {});
}

export function addMinutes(settings, minutes) {
    const log = readLog(settings);
    const key = todayKey();
    log[key] = (log[key] ?? 0) + minutes;
    const cutoff = todayKey(new Date(Date.now() - KEEP_DAYS * 86400000));
    for (const day of Object.keys(log)) {
        if (day < cutoff)
            delete log[day];
    }
    settings.set_string('study-log', JSON.stringify(log));
}

// Consecutive days with study, counting back from today (or from yesterday if today has none yet).
export function streak(log) {
    const day = new Date();
    if (!log[todayKey(day)])
        day.setDate(day.getDate() - 1);
    let count = 0;
    while (log[todayKey(day)] > 0) {
        count++;
        day.setDate(day.getDate() - 1);
    }
    return count;
}

export function lastDays(log, n) {
    return Array.from({length: n}, (_, i) => {
        const day = new Date();
        day.setDate(day.getDate() - (n - 1 - i));
        return {day, minutes: log[todayKey(day)] ?? 0};
    });
}
