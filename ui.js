import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

// A small clickable control on a widget. Widgets list their buttons in `_dwButtons` so edit mode can
// switch them off while widgets are being dragged.
export function button(widget, {label, icon, child, styleClass = '', onClick, ...props}) {
    // Pass only one of label/child: setting St.Button's label (even to null) replaces its child.
    const content = label !== undefined ? {label}
        : {child: child ?? new St.Icon({icon_name: icon, icon_size: 16})};
    const btn = new St.Button({style_class: `dw-btn ${styleClass}`, can_focus: false, ...content, ...props});
    btn.connect('clicked', onClick);
    (widget._dwButtons ??= []).push(btn);
    return btn;
}

export function todayKey(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseJson(settings, key, fallback) {
    try {
        return JSON.parse(settings.get_string(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

export function label(text, styleClass, props = {}) {
    return new St.Label({text, style_class: styleClass, ...props});
}

// Parses "YYYY-MM-DD" as local midnight, or returns null.
export function parseDate(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? '');
    return m ? GLib.DateTime.new_local(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, 0) : null;
}

export function daysBetween(from, to) {
    return Math.round(to.difference(from) / GLib.TIME_SPAN_DAY);
}

// Formats an hour and minute the way the top bar clock does (12- or 24-hour).
export class ClockFormat {
    constructor() {
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    }

    format(dateTime) {
        return this._interface.get_string('clock-format') === '12h'
            ? dateTime.format('%l:%M %p').trim() : dateTime.format('%H:%M');
    }

    at(hhmm, day = GLib.DateTime.new_now_local()) {
        const [h, m] = hhmm.split(':').map(Number);
        return this.format(GLib.DateTime.new_local(day.get_year(), day.get_month(), day.get_day_of_month(), h, m, 0));
    }
}
