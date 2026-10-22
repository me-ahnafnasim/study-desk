import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SNAP = 8;

// Lifts the widget layer above all windows so widgets can be dragged, then puts it back.
export class Editor {
    constructor(layer, widgets, {onSave, onReset, onRestore}) {
        this._layer = layer;
        this._widgets = widgets;
        this._onSave = onSave;
        this._onReset = onReset;
        this._onRestore = onRestore;
        this._backdrop = null;
    }

    toggle() {
        if (this._backdrop)
            this.close();
        else
            this.open();
    }

    open() {
        this._backdrop = new St.Widget({
            style_class: 'dw-edit-backdrop', reactive: true, can_focus: true,
            constraints: new Clutter.BindConstraint({source: global.stage, coordinate: Clutter.BindCoordinate.ALL}),
        });
        Main.layoutManager.uiGroup.insert_child_above(this._backdrop, global.window_group);
        this._layer.get_parent().remove_child(this._layer);
        this._backdrop.add_child(this._layer);

        const hint = new St.Label({
            style_class: 'dw-edit-hint',
            text: 'Drag widgets to move them   ·   R resets   ·   Esc or click empty space when done',
        });
        this._backdrop.add_child(hint);
        hint.connect('notify::width', () => {
            const m = Main.layoutManager.primaryMonitor;
            hint.set_position(m.x + Math.round((m.width - hint.width) / 2), m.y + m.height - hint.height - 120);
        });

        for (const w of this._widgets) {
            w._dwButtons?.forEach(b => (b.reactive = false)); // a press anywhere on a widget drags it
            w.add_style_class_name('dw-editing');
            w.connectObject('button-press-event', (_a, event) => this._startDrag(w, event), this);
        }
        this._backdrop.connect('motion-event', (_a, event) => this._motion(event));
        this._backdrop.connect('button-press-event', () => {
            this._pressed = true;
            return Clutter.EVENT_STOP;
        });
        this._backdrop.connect('button-release-event', () => this._release());
        this._backdrop.connect('key-press-event', (_a, event) => this._key(event));

        this._grab = Main.pushModal(this._backdrop, {actionMode: Shell.ActionMode.POPUP});
        // Another modal (e.g. a screenshot UI) may hold input; back out cleanly instead of half-opening.
        if ((this._grab.get_seat_state() & Clutter.GrabState.KEYBOARD) === 0) {
            this.close();
            return;
        }
        this._backdrop.grab_key_focus();
    }

    close() {
        if (!this._backdrop)
            return;
        Main.popModal(this._grab);
        this._grab = null;
        this._drag = null;
        this._pressed = false;
        for (const w of this._widgets) {
            w._dwButtons?.forEach(b => (b.reactive = true));
            w.remove_style_class_name('dw-editing');
            w.remove_style_class_name('dw-dragging');
            w.disconnectObject(this);
        }
        this._backdrop.remove_child(this._layer);
        this._onRestore();
        this._backdrop.destroy();
        this._backdrop = null;
    }

    _startDrag(w, event) {
        if (event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        this._drag = {w, dx: x - w.x, dy: y - w.y};
        w.add_style_class_name('dw-dragging');
        this._layer.set_child_above_sibling(w, null);
        return Clutter.EVENT_STOP;
    }

    _motion(event) {
        if (!this._drag)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        this._drag.w.set_position(x - this._drag.dx, y - this._drag.dy);
        return Clutter.EVENT_STOP;
    }

    _release() {
        if (!this._drag) {
            // Ignore the release of a button that was already down when edit mode opened.
            if (this._pressed)
                this.close();
            return Clutter.EVENT_STOP;
        }
        const {w} = this._drag;
        this._drag = null;
        w.remove_style_class_name('dw-dragging');
        w.set_position(
            Math.max(0, Math.min(Math.round(w.x / SNAP) * SNAP, global.stage.width - w.width * w.scale_x)),
            Math.max(0, Math.min(Math.round(w.y / SNAP) * SNAP, global.stage.height - w.height * w.scale_y)));
        this._onSave();
        return Clutter.EVENT_STOP;
    }

    _key(event) {
        const key = event.get_key_symbol();
        if (key === Clutter.KEY_Escape || key === Clutter.KEY_Return)
            this.close();
        else if (key === Clutter.KEY_r || key === Clutter.KEY_R)
            this._onReset();
        return Clutter.EVENT_STOP;
    }
}
