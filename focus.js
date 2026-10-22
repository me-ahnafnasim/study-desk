import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {addMinutes} from './studylog.js';
import {button, label, parseJson} from './ui.js';
import {CARD} from './utils.js';

const SESSIONS_BEFORE_LONG_BREAK = 4;
const LABELS = {idle: 'Ready to focus', focus: 'Focus', break: 'Break'};

function alert(title, body) {
    Main.notify(title, body);
    global.display.get_sound_player().play_from_theme('complete', title, null);
}

// Pomodoro timer. Its state lives in the settings, so a running session survives the screen locking
// (GNOME disables extensions while locked) and the shortcut, card and settings all agree.
export const FocusWidget = GObject.registerClass(
class FocusWidget extends St.BoxLayout {
    _init(settings) {
        super._init({style_class: 'dw-card dw-focus', orientation: Clutter.Orientation.VERTICAL,
            width: CARD, height: CARD});
        this.interval = 1;
        this._settings = settings;

        this._phase = label('', 'dw-focus-phase', {x_align: Clutter.ActorAlign.CENTER});
        const dial = new St.Widget({layout_manager: new Clutter.BinLayout(), x_align: Clutter.ActorAlign.CENTER,
            y_expand: true});
        this._ring = new St.DrawingArea({style_class: 'dw-focus-ring', width: 84, height: 84});
        this._ring.connect('repaint', () => this._draw());
        this._time = label('', 'dw-focus-time', {x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        dial.add_child(this._ring);
        dial.add_child(this._time);

        const controls = new St.BoxLayout({style_class: 'dw-focus-controls', x_align: Clutter.ActorAlign.CENTER});
        this._play = button(this, {icon: 'media-playback-start-symbolic', styleClass: 'dw-round', onClick: () => this.toggle()});
        controls.add_child(button(this, {icon: 'view-refresh-symbolic', styleClass: 'dw-round', onClick: () => this._reset()}));
        controls.add_child(this._play);
        controls.add_child(button(this, {icon: 'media-skip-forward-symbolic', styleClass: 'dw-round', onClick: () => this._skip()}));

        [this._phase, dial, controls].forEach(w => this.add_child(w));
        settings.connectObject('changed::focus-state', () => this.update(), this);
    }

    get _state() {
        return {phase: 'idle', done: 0, ...parseJson(this._settings, 'focus-state', {})};
    }

    _save(state) {
        this._settings.set_string('focus-state', JSON.stringify(state));
    }

    _length(phase, done) {
        if (phase === 'focus')
            return this._settings.get_int('focus-minutes') * 60000;
        const long = done > 0 && done % SESSIONS_BEFORE_LONG_BREAK === 0;
        return this._settings.get_int(long ? 'long-break-minutes' : 'break-minutes') * 60000;
    }

    _remaining(s) {
        if (s.phase === 'idle')
            return this._length('focus', s.done);
        return s.paused ? s.remaining : Math.max(0, s.endsAt - Date.now());
    }

    get running() {
        const s = this._state;
        return s.phase !== 'idle' && !s.paused;
    }

    toggle() {
        const s = this._state;
        if (s.phase === 'idle')
            this._save({...s, phase: 'focus', paused: false, endsAt: Date.now() + this._length('focus', s.done)});
        else if (s.paused)
            this._save({...s, paused: false, endsAt: Date.now() + s.remaining});
        else
            this._save({...s, paused: true, remaining: this._remaining(s)});
    }

    _reset() {
        this._save({phase: 'idle', done: this._state.done});
    }

    // Moves on without crediting the current phase.
    _skip() {
        const s = this._state;
        if (s.phase === 'focus')
            this._startBreak(s.done);
        else
            this._reset();
    }

    _startBreak(done) {
        this._save({phase: 'break', done, paused: false, endsAt: Date.now() + this._length('break', done)});
    }

    _finish(s) {
        if (s.phase === 'focus') {
            const minutes = this._settings.get_int('focus-minutes');
            addMinutes(this._settings, minutes);
            const done = s.done + 1;
            const breakMin = Math.round(this._length('break', done) / 60000);
            alert('Focus session complete', `${minutes} minutes done. Take a ${breakMin}-minute break.`);
            this._startBreak(done);
        } else {
            alert('Break is over', 'Ready for the next focus session?');
            this._save({phase: 'idle', done: s.done});
        }
    }

    update() {
        const s = this._state;
        if (s.phase !== 'idle' && !s.paused && Date.now() >= s.endsAt) {
            this._finish(s); // saving the new state calls update() again
            return;
        }
        const left = Math.ceil(this._remaining(s) / 1000);
        this._time.text = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        this._phase.text = s.paused ? `${LABELS[s.phase]} · paused` : LABELS[s.phase];
        this._play.child.icon_name = s.phase !== 'idle' && !s.paused
            ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        this._progress = s.phase === 'idle' ? 0 : 1 - this._remaining(s) / this._length(s.phase, s.done);
        this._breakPhase = s.phase === 'break';
        this._ring.queue_repaint();
    }

    _draw() {
        const cr = this._ring.get_context();
        const [w, h] = this._ring.get_surface_size();
        const r = Math.min(w, h) / 2 - 4, cx = w / 2, cy = h / 2;
        cr.setLineWidth(6);
        cr.setLineCap(1);
        cr.setSourceRGBA(1, 1, 1, 0.15);
        cr.arc(cx, cy, r, 0, 2 * Math.PI);
        cr.stroke();
        if (this._progress > 0) {
            if (this._breakPhase)
                cr.setSourceRGB(0.31, 0.82, 0.71);
            else
                cr.setSourceRGB(1, 0.62, 0.42);
            cr.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + this._progress * 2 * Math.PI);
            cr.stroke();
        }
        cr.$dispose();
    }
});
