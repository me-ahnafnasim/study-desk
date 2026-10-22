import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const AWAY_MS = 5 * 60 * 1000; // this long without input counts as having taken a break

// Notifies after a long unbroken stretch at the screen. Quiet while the focus timer is running,
// since Pomodoro already schedules its own breaks.
export class BreakReminder {
    constructor(settings, isFocusing) {
        this._settings = settings;
        this._isFocusing = isFocusing;
        this._monitor = global.backend.get_core_idle_monitor();
        this._activeSince = Date.now();
        this._idleWatch = this._monitor.add_idle_watch(AWAY_MS, () => {
            this._activeSince = null;
            this._activeWatch ||= this._monitor.add_user_active_watch(() => {
                this._activeWatch = 0;
                this._activeSince = Date.now();
            });
        });
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            this._check();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _check() {
        const every = this._settings.get_int('break-every-minutes') * 60000;
        if (!this._settings.get_boolean('break-reminders') || this._activeSince === null || this._isFocusing())
            return;
        if (Date.now() - this._activeSince >= every) {
            Main.notify('Time for a short break',
                `You've been at the screen for ${Math.round(every / 60000)} minutes. Stand up, drink some water and rest your eyes.`);
            this._activeSince = Date.now();
        }
    }

    destroy() {
        GLib.source_remove(this._timer);
        this._monitor.remove_watch(this._idleWatch);
        if (this._activeWatch)
            this._monitor.remove_watch(this._activeWatch);
    }
}
