import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {ClockFormat, label, parseJson} from './ui.js';
import {WIDE, formatDuration} from './utils.js';

const minutesOf = hhmm => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

// The class happening now and the next one, from a weekly timetable set up in the settings.
export const TimetableWidget = GObject.registerClass(
class TimetableWidget extends St.BoxLayout {
    _init(settings) {
        super._init({style_class: 'dw-card dw-timetable', orientation: Clutter.Orientation.VERTICAL, width: WIDE});
        this.interval = 30;
        this._settings = settings;
        this._clock = new ClockFormat();

        this._nowHead = label('NOW', 'dw-tt-head');
        this._now = label('', 'dw-tt-now');
        this._nowInfo = label('', 'dw-tt-info');
        this._track = new St.Widget({style_class: 'dw-sys-track', x_expand: true});
        this._fill = new St.Widget({style_class: 'dw-sys-fill dw-tt-fill'});
        this._track.add_child(this._fill);
        this._track.connect('notify::width', () => this._resize());
        this._next = label('', 'dw-tt-next');
        [this._nowHead, this._now, this._nowInfo, this._track, this._next].forEach(w => this.add_child(w));
        settings.connectObject('changed::timetable', () => this.update(), this);
    }

    update() {
        const now = GLib.DateTime.new_now_local();
        const weekday = now.get_day_of_week() % 7; // Sunday = 0
        const minute = now.get_hour() * 60 + now.get_minute();
        const classes = parseJson(this._settings, 'timetable', [])
            .filter(c => /^\d\d:\d\d$/.test(c.start) && /^\d\d:\d\d$/.test(c.end));
        const on = day => classes.filter(c => Number(c.day) === day).sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
        const today = on(weekday);

        const current = today.find(c => minutesOf(c.start) <= minute && minute < minutesOf(c.end));
        const next = today.find(c => minutesOf(c.start) > minute);

        this._track.visible = !!current;
        if (current) {
            const [start, end] = [minutesOf(current.start), minutesOf(current.end)];
            this._nowHead.text = 'NOW';
            this._now.text = current.title;
            this._nowInfo.text = [current.place, `until ${this._clock.at(current.end)}`,
                `${formatDuration((end - minute) * 60)} left`].filter(Boolean).join('  ·  ');
            this._fraction = (minute - start) / Math.max(1, end - start);
            this._resize();
        } else {
            this._nowHead.text = 'NOW';
            this._now.text = classes.length ? 'Free time' : 'No timetable yet';
            this._nowInfo.text = classes.length ? '' : 'Add your classes in Settings';
        }

        if (next) {
            this._next.text = `Next: ${next.title} at ${this._clock.at(next.start)}` +
                `${next.place ? ` · ${next.place}` : ''}  (in ${formatDuration((minutesOf(next.start) - minute) * 60)})`;
        } else {
            const tomorrow = on((weekday + 1) % 7)[0];
            this._next.text = tomorrow
                ? `No more classes today · Tomorrow: ${tomorrow.title} at ${this._clock.at(tomorrow.start)}`
                : classes.length ? 'No more classes today' : '';
        }
        this._next.visible = !!this._next.text;
    }

    _resize() {
        this._fill.set_size(Math.round(this._track.width * (this._fraction ?? 0)), this._track.height);
    }
});
