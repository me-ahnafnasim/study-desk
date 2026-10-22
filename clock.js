import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {WIDE} from './utils.js';

export const ClockWidget = GObject.registerClass(
class ClockWidget extends St.BoxLayout {
    _init() {
        super._init({
            style_class: 'dw-card dw-clock',
            orientation: Clutter.Orientation.VERTICAL,
            width: WIDE, height: 132,
        });
        this.interval = 1;
        this._time = new St.Label({style_class: 'dw-clock-time', x_align: Clutter.ActorAlign.CENTER});
        this._date = new St.Label({style_class: 'dw-clock-date', x_align: Clutter.ActorAlign.CENTER});
        this.add_child(new St.Widget({y_expand: true}));
        this.add_child(this._time);
        this.add_child(this._date);
        this.add_child(new St.Widget({y_expand: true}));

        // Follow the system 12/24-hour preference.
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._interface.connectObject('changed::clock-format', () => {
            this._shown = null;
            this.update();
        }, this);
    }

    update() {
        const now = GLib.DateTime.new_now_local();
        const format = this._interface.get_string('clock-format') === '12h' ? '%l:%M' : '%H:%M';
        const time = now.format(format).trim();
        if (time === this._shown)
            return;
        this._shown = time;
        this._time.text = time;
        this._date.text = now.format('%a %e %b').replace(/ +/g, ' ');
    }
});
