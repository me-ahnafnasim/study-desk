import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {activeSpans, hourlyUsage, readHistory} from './history.js';
import {CARD, WIDE, formatDuration, isCancelled, isNotFound, warn} from './utils.js';

export const ScreenTimeWidget = GObject.registerClass(
class ScreenTimeWidget extends St.BoxLayout {
    _init() {
        super._init({
            style_class: 'dw-card dw-screentime',
            orientation: Clutter.Orientation.VERTICAL,
            width: WIDE, height: CARD,
        });
        this.interval = 60;
        this._hours = new Array(24).fill(0);

        const header = new St.BoxLayout({style_class: 'dw-st-header'});
        header.add_child(new St.Label({text: '🙂', style_class: 'dw-st-emoji'}));
        this._total = new St.Label({text: '0m', style_class: 'dw-st-total', y_align: Clutter.ActorAlign.CENTER});
        header.add_child(this._total);

        this._chart = new St.DrawingArea({y_expand: true, x_expand: true});
        this._chart.connect('repaint', () => this._draw());
        this._cancellable = new Gio.Cancellable();
        this.connect('destroy', () => this._cancellable.cancel());
        this.add_child(header);
        this.add_child(this._chart);
    }

    async update() {
        try {
            const now = Math.floor(Date.now() / 1000);
            this._hours = hourlyUsage(activeSpans(await readHistory(this._cancellable), now), now);
            this._total.text = formatDuration(this._hours.reduce((a, b) => a + b, 0));
        } catch (e) {
            if (isCancelled(e))
                return;
            // No history file means screen time is off in Settings > Wellbeing.
            this._total.text = isNotFound(e) ? 'Off' : '--';
            if (!isNotFound(e))
                warn('screen time', e.message);
        }
        this._chart.queue_repaint();
    }

    _draw() {
        const cr = this._chart.get_context();
        const [w, h] = this._chart.get_surface_size();
        const font = h * 0.09, axis = w * 0.17, chartW = w - axis, chartH = h - font * 2;

        cr.selectFontFace('Sans', 0, 0);
        cr.setFontSize(font);
        cr.setLineWidth(1);
        [[0, '60m'], [0.5, '30m'], [1, '0m']].forEach(([f, label]) => {
            const y = Math.round(f * chartH) + 0.5;
            cr.setSourceRGBA(1, 1, 1, 0.15);
            cr.moveTo(0, y);
            cr.lineTo(chartW, y);
            cr.stroke();
            cr.setSourceRGBA(1, 1, 1, 0.5);
            cr.moveTo(chartW + 3, y + font / 2.5);
            cr.showText(label);
        });

        const slot = chartW / 24;
        cr.setSourceRGB(0.04, 0.52, 1);
        this._hours.forEach((secs, i) => {
            const barH = Math.min(secs / 3600, 1) * chartH;
            if (barH > 0)
                cr.rectangle(i * slot + slot * 0.18, chartH - barH, slot * 0.64, barH);
        });
        cr.fill();

        cr.setSourceRGBA(1, 1, 1, 0.5);
        [[0, '12AM'], [6, '6AM'], [12, '12PM'], [18, '6PM']].forEach(([i, label]) => {
            cr.moveTo(i * slot, h - font * 0.3);
            cr.showText(label);
        });
        cr.$dispose();
    }
});
