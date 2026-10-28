// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Ahnaf Nasim

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {BreakReminder} from './breaks.js';
import {defaultColumn} from './catalog.js';
import {DesktopLayer} from './desktopLayer.js';
import {Editor} from './editor.js';
import {stackLayout} from './layout.js';
import {applyStyle} from './style.js';
import {parseJson} from './ui.js';
import {WIDGETS} from './widgets.js';

// Settings that change how the widgets look or where they sit; the rest are read by the widgets.
const LAYOUT_KEYS = ['visible-widgets', 'tint-color', 'glass-opacity', 'colored-widgets',
    'show-border', 'show-shadow', 'corner-radius', 'widget-scale', 'app-count'];
// Changing these rebuilds the stack, so widgets that were dragged elsewhere rejoin it.
const STACK_KEYS = ['stack-position', 'stack-margin', 'widget-order', 'widget-columns'];

export default class StudyDeskExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._layer = new St.Widget({reactive: false});
        this._widgets = Object.entries(WIDGETS).map(([key, Widget]) => {
            const widget = new Widget(this._settings);
            widget._dwKey = key;
            // Cards swallow clicks so the desktop-icons window underneath never gets them.
            widget.reactive = true;
            this._layer.add_child(widget);
            // System info grows as app rows fill in; keep a bottom-anchored stack on screen.
            widget.connectObject('notify::height', () => this._place(), this);
            return widget;
        });
        this._desktop = new DesktopLayer(this._layer);

        this._editor = new Editor(this._layer, this._widgets, {
            onSave: () => this._save(),
            onReset: () => this._settings.reset('positions'),
            onRestore: () => this._desktop.restore(),
        });
        Main.wm.addKeybinding('edit-widgets', this._settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL, () => this._editor.toggle());
        Main.wm.addKeybinding('focus-toggle', this._settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL, () => this._byKey('focus').toggle());
        this._breaks = new BreakReminder(this._settings, () => this._byKey('focus').running);
        Main.layoutManager.connectObject('monitors-changed', () => this._applySettings(), this);
        this._settings.connectObject('changed', (_s, key) => {
            if (STACK_KEYS.includes(key)) {
                this._settings.reset('positions');
                this._place();
            } else if (LAYOUT_KEYS.includes(key))
                this._applySettings(key);
            else if (key === 'positions' && !this._saving)
                this._place();
        }, this);
        this._byKey('weather').connect('restyle', w => applyStyle(w, this._settings));
        this._applySettings();

        this._sources = this._widgets.map(w => {
            if (w.visible)
                w.update();
            if (!w.interval)
                return 0;
            return GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, w.interval, () => {
                if (w.visible)
                    w.update();
                return GLib.SOURCE_CONTINUE;
            });
        });
    }

    disable() {
        this._editor.close();
        Main.wm.removeKeybinding('edit-widgets');
        Main.wm.removeKeybinding('focus-toggle');
        this._breaks.destroy();
        this._breaks = null;
        this._sources.filter(Boolean).forEach(id => GLib.source_remove(id));
        Main.layoutManager.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._widgets.forEach(w => w.disconnectObject(this));
        this._desktop.destroy();
        this._desktop = null;
        this._layer.destroy();
        this._layer = null;
        this._widgets = null;
        this._sources = null;
        this._editor = null;
        this._settings = null;
    }

    _byKey(key) {
        return this._widgets.find(w => w._dwKey === key);
    }

    _applySettings(key = null) {
        if (!key || key === 'app-count')
            this._byKey('sysinfo').setAppCount(this._settings.get_int('app-count'));

        const visible = this._settings.get_strv('visible-widgets');
        for (const w of this._widgets) {
            const show = visible.includes(w._dwKey);
            if (show && !w.visible && this._sources)
                w.update(); // refresh a widget that was hidden while its data went stale
            w.visible = show;
            applyStyle(w, this._settings);
        }
        this._place();
    }

    _savedPositions() {
        try {
            return JSON.parse(this._settings.get_string('positions'));
        } catch {
            return {};
        }
    }

    _fits(stack, scale, area) {
        for (const [w, [x, y]] of stack) {
            if (x < area.x || y < area.y
                || x + w.width * scale > area.x + area.width
                || y + w.height * scale > area.y + area.height)
                return false;
        }
        return true;
    }

    // Visible widgets in the user's order; widgets missing from the setting (e.g. new ones) go last.
    _ordered() {
        const order = this._settings.get_strv('widget-order');
        const rank = key => (order.includes(key) ? order.indexOf(key) : order.length);
        return this._widgets.filter(w => w.visible).sort((a, b) => rank(a._dwKey) - rank(b._dwKey));
    }

    _place() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor || !this._settings)
            return;
        const saved = this._savedPositions();
        const area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        const columns = parseJson(this._settings, 'widget-columns', {});
        const opts = {
            columnOf: w => Number(columns[w._dwKey]) || defaultColumn(w._dwKey),
            anchor: this._settings.get_string('stack-position'),
            margin: this._settings.get_int('stack-margin'),
            area,
        };

        // Starting from the user's widget-scale, shrink a notch at a time until every card
        // lands inside the screen; 0.6 is the smallest scale the settings allow.
        let scale = this._settings.get_double('widget-scale');
        let stack = stackLayout(this._ordered(), {...opts, scale});
        while (scale > 0.6 && !this._fits(stack, scale, area)) {
            scale = Math.max(0.6, scale - 0.02);
            stack = stackLayout(this._ordered(), {...opts, scale});
        }
        for (const w of this._widgets)
            w.set_scale(scale, scale);
        for (const [w, [x, y]] of stack) {
            const [px, py] = saved[w._dwKey] ? [monitor.x + saved[w._dwKey][0], monitor.y + saved[w._dwKey][1]] : [x, y];
            w.set_position(
                Math.max(0, Math.min(px, global.stage.width - w.width * scale)),
                Math.max(0, Math.min(py, global.stage.height - w.height * scale)));
        }
    }

    _save() {
        const monitor = Main.layoutManager.primaryMonitor;
        const positions = Object.fromEntries(this._widgets.map(w =>
            [w._dwKey, [Math.round(w.x - monitor.x), Math.round(w.y - monitor.y)]]));
        this._saving = true;
        this._settings.set_string('positions', JSON.stringify(positions));
        this._saving = false;
    }
}
