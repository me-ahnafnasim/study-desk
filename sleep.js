import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {activeSpans, estimateSleep, localMidnight, readHistory} from './history.js';
import {ClockFormat, label, parseJson} from './ui.js';
import {WIDE, formatDuration, isCancelled, isNotFound, warn} from './utils.js';

const BAR_HEIGHT = 40;

// A night corrected in the settings: bedtime after noon belongs to the evening before.
function override(entry, wakeDay) {
    const [bed, wake] = entry.map(t => t.split(':').map(Number));
    const bedTime = wakeDay.add_days(bed[0] >= 12 ? -1 : 0).add_hours(bed[0]).add_minutes(bed[1]).to_unix();
    return [bedTime, wakeDay.add_hours(wake[0]).add_minutes(wake[1]).to_unix()];
}

// Sleep estimated from overnight inactivity in GNOME's screen-time history, with optional corrections.
export const SleepWidget = GObject.registerClass(
class SleepWidget extends St.BoxLayout {
    _init(settings) {
        super._init({style_class: 'dw-card dw-sleep', orientation: Clutter.Orientation.VERTICAL, width: WIDE});
        this.interval = 300;
        this._settings = settings;
        this._clock = new ClockFormat();
        this._cancellable = new Gio.Cancellable();

        const head = new St.BoxLayout({style_class: 'dw-sleep-headrow'});
        head.add_child(label('😴', 'dw-sleep-emoji'));
        const titles = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        this._total = label('--', 'dw-sleep-total');
        this._range = label('', 'dw-sleep-range');
        titles.add_child(this._total);
        titles.add_child(this._range);
        head.add_child(titles);
        this._goal = label('', 'dw-sleep-goal', {y_align: Clutter.ActorAlign.START});
        head.add_child(this._goal);

        this._week = new St.BoxLayout({style_class: 'dw-sleep-week'});
        this._bars = Array.from({length: 7}, () => {
            const col = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
            const slot = new St.Widget({height: BAR_HEIGHT, width: 16, x_align: Clutter.ActorAlign.CENTER});
            const bar = new St.Widget({style_class: 'dw-sleep-bar', width: 16});
            slot.add_child(bar);
            const day = label('', 'dw-streak-day', {x_align: Clutter.ActorAlign.CENTER});
            col.add_child(slot);
            col.add_child(day);
            this._week.add_child(col);
            return {bar, day};
        });
        this._avg = label('', 'dw-sleep-avg');
        [head, this._week, this._avg].forEach(w => this.add_child(w));

        settings.connectObject('changed::sleep-goal-hours', () => this.update(),
            'changed::sleep-overrides', () => this.update(), this);
        this.connect('destroy', () => this._cancellable.cancel());
    }

    async update() {
        let history;
        try {
            history = await readHistory(this._cancellable);
        } catch (e) {
            if (isCancelled(e))
                return;
            if (!isNotFound(e))
                warn('sleep', e.message);
            history = [];
        }
        const now = Math.floor(Date.now() / 1000);
        const spans = activeSpans(history, now);
        const overrides = parseJson(this._settings, 'sleep-overrides', {});
        const goal = this._settings.get_double('sleep-goal-hours') * 3600;

        const nights = Array.from({length: 7}, (_, i) => {
            const wakeDay = localMidnight(6 - i);
            const fixed = overrides[wakeDay.format('%F')];
            return {wakeDay, sleep: fixed ? override(fixed, wakeDay) : estimateSleep(spans, history, wakeDay, now)};
        });
        const last = nights.at(-1).sleep;
        const fmt = t => this._clock.format(GLib.DateTime.new_from_unix_local(t));
        this._total.text = last ? formatDuration(last[1] - last[0]) : 'No data';
        this._range.text = last ? `last night · ${fmt(last[0])} → ${fmt(last[1])}`
            : history.length ? 'last night · not detected yet' : 'Turn on Screen Time in Settings › Wellbeing';
        this._goal.text = last ? `${Math.round((last[1] - last[0]) / goal * 100)}% of goal` : '';

        nights.forEach(({wakeDay, sleep}, i) => {
            const h = sleep ? Math.max(3, Math.round(Math.min(1, (sleep[1] - sleep[0]) / goal) * BAR_HEIGHT)) : 3;
            this._bars[i].bar.set({height: h, y: BAR_HEIGHT - h, opacity: sleep ? 255 : 70});
            this._bars[i].day.text = wakeDay.format('%a').slice(0, 1);
        });
        const known = nights.filter(n => n.sleep);
        this._avg.text = known.length
            ? `Average ${formatDuration(known.reduce((a, n) => a + n.sleep[1] - n.sleep[0], 0) / known.length)} over ${known.length} nights`
            : '';
    }
});
