import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {CARD} from './utils.js';

// Localized one-letter weekday names, Sunday first (1 Jan 2023 was a Sunday).
function weekdayLetters() {
    return Array.from({length: 7}, (_, i) =>
        GLib.DateTime.new_local(2023, 1, 1 + i, 0, 0, 0).format('%a').slice(0, 1).toUpperCase());
}

export const CalendarWidget = GObject.registerClass(
class CalendarWidget extends St.BoxLayout {
    _init() {
        super._init({
            style_class: 'dw-card dw-calendar',
            orientation: Clutter.Orientation.VERTICAL,
            width: CARD, height: CARD,
        });
        this.interval = 60;
        this._month = new St.Label({style_class: 'dw-cal-month'});
        this._layout = new Clutter.GridLayout();
        this._grid = new St.Widget({layout_manager: this._layout, x_expand: true});
        this.add_child(this._month);
        this.add_child(this._grid);
        this._shown = null;
    }

    update() {
        const now = GLib.DateTime.new_now_local();
        const key = now.format('%F');
        if (key === this._shown)
            return;
        this._shown = key;

        this._month.text = now.format('%B').toUpperCase();
        this._grid.destroy_all_children();
        const weekStart = Shell.util_get_week_start(); // 0 = Sunday, per locale
        const days = weekdayLetters();
        for (let col = 0; col < 7; col++)
            this._cell(days[(weekStart + col) % 7], col, 0, 'dw-cal-head');

        const first = GLib.DateTime.new_local(now.get_year(), now.get_month(), 1, 0, 0, 0);
        const offset = (first.get_day_of_week() % 7 - weekStart + 7) % 7;
        const count = GLib.Date.get_days_in_month(now.get_month(), now.get_year());
        for (let d = 1; d <= count; d++) {
            const pos = offset + d - 1;
            const today = d === now.get_day_of_month();
            this._cell(`${d}`, pos % 7, 1 + Math.floor(pos / 7), today ? 'dw-cal-today' : 'dw-cal-day');
        }
    }

    _cell(text, col, row, styleClass) {
        const label = new St.Label({text, style_class: `dw-cal-cell ${styleClass}`});
        this._layout.attach(label, col, row, 1, 1);
    }
});
