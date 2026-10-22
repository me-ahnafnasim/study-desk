import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

// Connects to a settings change for as long as the preferences window is open.
export function watch(settings, window, key, callback) {
    const id = settings.connect(`changed::${key}`, callback);
    window.connect('close-request', () => settings.disconnect(id));
}

export function toast(window, title) {
    window.add_toast(new Adw.Toast({title, timeout: 3}));
}

export function switchRow(settings, key, title, subtitle = '') {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

export function spinRow(settings, key, title, lower, upper, step, digits = 0, subtitle = '') {
    const row = Adw.SpinRow.new_with_range(lower, upper, step);
    row.set({title, digits, subtitle});
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

// A drop-down for a string setting with a fixed set of values.
export function comboRow(settings, window, key, title, values, labels) {
    const row = new Adw.ComboRow({title, model: Gtk.StringList.new(labels)});
    const sync = () => (row.selected = Math.max(0, values.indexOf(settings.get_string(key))));
    sync();
    row.connect('notify::selected', () => {
        if (settings.get_string(key) !== values[row.selected])
            settings.set_string(key, values[row.selected]);
    });
    watch(settings, window, key, sync);
    return row;
}

export function colorRow(settings, window, key, title) {
    const button = new Gtk.ColorDialogButton({dialog: new Gtk.ColorDialog({with_alpha: false}), valign: Gtk.Align.CENTER});
    const sync = () => {
        const rgba = new Gdk.RGBA();
        if (rgba.parse(settings.get_string(key)))
            button.rgba = rgba;
    };
    sync();
    button.connect('notify::rgba', () => {
        const hex = [button.rgba.red, button.rgba.green, button.rgba.blue]
            .map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
        if (settings.get_string(key) !== `#${hex}`)
            settings.set_string(key, `#${hex}`);
    });
    watch(settings, window, key, sync);
    const row = new Adw.ActionRow({title, activatable_widget: button});
    row.add_suffix(button);
    return row;
}

export function entryRow(settings, key, title) {
    const row = new Adw.EntryRow({title, text: settings.get_string(key), show_apply_button: true});
    row.connect('apply', () => settings.set_string(key, row.text.trim()));
    return row;
}

export function buttonRow(title, subtitle, label, onClick) {
    const button = new Gtk.Button({label, valign: Gtk.Align.CENTER});
    button.connect('clicked', onClick);
    const row = new Adw.ActionRow({title, subtitle});
    row.add_suffix(button);
    return row;
}

// Multi-line note that saves shortly after typing stops, and when the window closes.
export function noteEditor(settings, window) {
    const view = new Gtk.TextView({wrap_mode: Gtk.WrapMode.WORD_CHAR, top_margin: 10, bottom_margin: 10,
        left_margin: 12, right_margin: 12, accepts_tab: false});
    view.buffer.text = settings.get_string('note-text');
    let pending = 0;
    const save = () => {
        if (pending)
            GLib.source_remove(pending);
        pending = 0;
        if (settings.get_string('note-text') !== view.buffer.text) {
            settings.set_string('note-text', view.buffer.text);
            settings.set_int64('note-updated', Math.floor(Date.now() / 1000));
        }
        return GLib.SOURCE_REMOVE;
    };
    view.buffer.connect('changed', () => {
        if (pending)
            GLib.source_remove(pending);
        pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, save);
    });
    window.connect('close-request', () => {
        save();
        return false;
    });
    const frame = new Gtk.Frame({child: new Gtk.ScrolledWindow({child: view, min_content_height: 110,
        hscrollbar_policy: Gtk.PolicyType.NEVER})});
    frame.add_css_class('view');
    return frame;
}
