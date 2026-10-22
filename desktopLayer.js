import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Desktop-icon extensions such as DING draw the desktop as a full-screen window kept at the bottom.
// DING titles it "Desktop Icons <monitor>" (newer) or "@!x,y;BDHF" (older); X11 apps use the DESKTOP type.
function isDesktopWindow(win) {
    const title = win.get_title() ?? '';
    return win.get_window_type() === Meta.WindowType.DESKTOP ||
        !!win.customJS_ding?._keepAtBottom ||
        /^Desktop Icons \d+$/.test(title) ||
        /^@!.*;[A-Z]*B/.test(title);
}

// Keeps the widget layer in the window group just above the wallpaper and any desktop-icons window,
// but below every app window: widgets stay behind apps and still receive clicks.
// Mutter lowers window actors to the bottom when it re-sorts them, so we re-seat after each restack.
export class DesktopLayer {
    constructor(layer) {
        this._layer = layer;
        global.window_group.add_child(layer);
        global.display.connectObject(
            // Mutter re-sorts window actors in its own later (SYNC_STACK), after 'restacked' is emitted;
            // BEFORE_REDRAW laters run after that, so re-seat the layer there.
            'restacked', () => this._syncLater(),
            'window-created', (_d, win) => {
                win.connectObject('notify::title', () => this._syncLater(), this);
                this._syncLater();
            }, this);
        this.sync();
    }

    sync() {
        if (this._layer.get_parent() !== global.window_group)
            return; // lifted out by edit mode
        // global.get_window_actors() leaves out DING's window, so look at the window group's children directly.
        const desktop = global.window_group.get_children()
            .filter(a => a.meta_window && isDesktopWindow(a.meta_window)).at(-1);
        global.window_group.set_child_above_sibling(this._layer, desktop ?? Main.layoutManager._backgroundGroup);
    }

    _syncLater() {
        if (this._later)
            return;
        this._later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._later = 0;
            this.sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Puts the layer back after edit mode lifted it above the windows.
    restore() {
        const parent = this._layer.get_parent();
        if (parent !== global.window_group) {
            parent?.remove_child(this._layer);
            global.window_group.add_child(this._layer);
        }
        this.sync();
    }

    destroy() {
        global.display.disconnectObject(this);
        global.display.list_all_windows().forEach(win => win.disconnectObject(this));
        if (this._later)
            global.compositor.get_laters().remove(this._later);
        this._later = 0;
    }
}
