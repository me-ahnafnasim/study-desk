import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {button, daysBetween, label, parseDate, parseJson} from './ui.js';
import {CARD} from './utils.js';

// Days until upcoming exams; click to flip to the next one.
export const CountdownWidget = GObject.registerClass(
class CountdownWidget extends St.BoxLayout {
    _init(settings) {
        super._init({style_class: 'dw-card dw-countdown', width: CARD, height: CARD});
        this.interval = 60;
        this._settings = settings;
        this._index = 0;

        const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_expand: true});
        this._head = label('EXAM', 'dw-countdown-head');
        this._days = label('—', 'dw-countdown-days');
        this._unit = label('', 'dw-countdown-unit');
        this._name = label('', 'dw-countdown-name');
        this._name.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._date = label('', 'dw-countdown-date');
        for (const w of [this._head, this._days, this._unit, new St.Widget({y_expand: true}), this._name, this._date])
            box.add_child(w);
        this.add_child(button(this, {child: box, styleClass: 'dw-card-button', x_expand: true, y_expand: true,
            onClick: () => {
                this._index++;
                this.update();
            }}));

        settings.connectObject('changed::exams', () => {
            this._index = 0;
            this.update();
        }, this);
    }

    update() {
        const today = GLib.DateTime.new_now_local();
        const midnight = GLib.DateTime.new_local(today.get_year(), today.get_month(), today.get_day_of_month(), 0, 0, 0);
        const exams = parseJson(this._settings, 'exams', [])
            .map(e => ({...e, when: parseDate(e.date)}))
            .filter(e => e.when && daysBetween(midnight, e.when) >= 0)
            .sort((a, b) => a.when.compare(b.when));

        if (!exams.length) {
            this._head.text = 'EXAM COUNTDOWN';
            this._days.text = '—';
            this._unit.text = '';
            this._name.text = 'No exams yet';
            this._date.text = 'Add one in Settings';
            return;
        }
        const exam = exams[this._index % exams.length];
        const days = daysBetween(midnight, exam.when);
        this._head.text = exams.length > 1 ? `EXAM ${this._index % exams.length + 1}/${exams.length}` : 'EXAM';
        this._days.text = days === 0 ? 'Today' : `${days}`;
        this._unit.text = days === 0 ? 'good luck!' : days === 1 ? 'day left' : 'days left';
        this._name.text = exam.name || 'Exam';
        this._date.text = exam.when.format('%a %e %b %Y').replace(/ +/g, ' ');
        this._days.style = days <= 7 ? 'color: #ff9f6b;' : null;
    }
});
