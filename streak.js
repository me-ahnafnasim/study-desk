import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {lastDays, readLog, streak} from './studylog.js';
import {label} from './ui.js';
import {WIDE, formatDuration} from './utils.js';

const BAR_HEIGHT = 34;

// Study streak, today's progress toward the daily goal, and the last 7 days, from focus sessions.
export const StreakWidget = GObject.registerClass(
class StreakWidget extends St.BoxLayout {
    _init(settings) {
        super._init({style_class: 'dw-card dw-streak', width: WIDE});
        this.interval = 60;
        this._settings = settings;

        const left = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'dw-streak-left'});
        this._count = label('0', 'dw-streak-count');
        left.add_child(label('🔥', 'dw-streak-fire'));
        left.add_child(this._count);
        left.add_child(label('day streak', 'dw-streak-unit'));

        const right = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true,
            style_class: 'dw-streak-right'});
        this._goal = label('', 'dw-streak-goal');
        this._track = new St.Widget({style_class: 'dw-sys-track', x_expand: true});
        this._fill = new St.Widget({style_class: 'dw-sys-fill dw-streak-fill'});
        this._track.add_child(this._fill);
        this._track.connect('notify::width', () => this._resize());
        this._week = new St.BoxLayout({style_class: 'dw-streak-week', x_expand: true});
        this._days = Array.from({length: 7}, () => {
            const col = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
            const slot = new St.Widget({height: BAR_HEIGHT, x_align: Clutter.ActorAlign.CENTER, width: 14});
            const bar = new St.Widget({style_class: 'dw-streak-bar', width: 14});
            slot.add_child(bar);
            const name = label('', 'dw-streak-day', {x_align: Clutter.ActorAlign.CENTER});
            col.add_child(slot);
            col.add_child(name);
            this._week.add_child(col);
            return {bar, name};
        });
        [label('Today', 'dw-streak-title'), this._goal, this._track, this._week].forEach(w => right.add_child(w));

        this.add_child(left);
        this.add_child(right);
        settings.connectObject('changed::study-log', () => this.update(),
            'changed::daily-goal-minutes', () => this.update(), this);
    }

    update() {
        const log = readLog(this._settings);
        const goal = this._settings.get_int('daily-goal-minutes');
        const days = lastDays(log, 7);
        const today = days.at(-1).minutes;

        this._count.text = `${streak(log)}`;
        this._goal.text = `${formatDuration(today * 60)} of ${formatDuration(goal * 60)} goal`;
        this._fraction = Math.min(1, today / goal);
        this._resize();
        days.forEach(({day, minutes}, i) => {
            const h = Math.round(Math.min(1, minutes / goal) * BAR_HEIGHT);
            this._days[i].bar.set({height: Math.max(2, h), y: BAR_HEIGHT - Math.max(2, h), opacity: minutes ? 255 : 90});
            this._days[i].name.text = day.toLocaleDateString(undefined, {weekday: 'narrow'});
        });
    }

    _resize() {
        this._fill.set_size(Math.round(this._track.width * (this._fraction ?? 0)), this._track.height);
    }
});
