import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {CARD, isCancelled, isNotFound, readText, warn} from './utils.js';

// The optional text file to show instead of the note written in the settings.
function notesPath(settings) {
    const custom = settings.get_string('notes-file').trim();
    if (!custom)
        return null;
    if (custom.startsWith('~/'))
        return GLib.build_filenamev([GLib.get_home_dir(), custom.slice(2)]);
    return GLib.path_is_absolute(custom) ? custom : GLib.build_filenamev([GLib.get_home_dir(), custom]);
}

function relativeDate(unix) {
    const then = GLib.DateTime.new_from_unix_local(unix);
    const now = GLib.DateTime.new_now_local();
    const day = d => GLib.DateTime.new_local(d.get_year(), d.get_month(), d.get_day_of_month(), 0, 0, 0);
    const days = Math.round(day(now).difference(day(then)) / GLib.TIME_SPAN_DAY);
    if (days === 0)
        return `Today ${then.format('%X').replace(/:\d\d(?=\D*$)/, '')}`;
    if (days === 1)
        return 'Yesterday';
    return then.format('%e %b %Y').trim();
}

export const NotesWidget = GObject.registerClass(
class NotesWidget extends St.BoxLayout {
    _init(settings) {
        super._init({
            style_class: 'dw-card dw-notes',
            orientation: Clutter.Orientation.VERTICAL,
            width: CARD, height: CARD,
        });
        this.interval = 0; // driven by settings changes or the file monitor
        this._settings = settings;
        this._cancellable = new Gio.Cancellable();

        const header = this._header = new St.BoxLayout({style_class: 'dw-notes-header'});
        header.add_child(new St.Icon({icon_name: 'folder-symbolic', icon_size: 14}));
        header.add_child(new St.Label({text: 'Notes', style_class: 'dw-notes-heading'}));

        const body = new St.BoxLayout({style_class: 'dw-notes-body',
            orientation: Clutter.Orientation.VERTICAL, y_expand: true});
        this._title = new St.Label({style_class: 'dw-notes-title'});
        this._text = new St.Label({style_class: 'dw-notes-text', y_expand: true});
        this._date = new St.Label({style_class: 'dw-notes-date'});
        for (const label of [this._title, this._text]) {
            label.clutter_text.line_wrap = true;
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        }
        this._text.clip_to_allocation = true;
        body.add_child(this._title);
        body.add_child(this._text);
        body.add_child(this._date);
        this.add_child(header);
        this.add_child(body);

        settings.connectObject(
            'changed::notes-file', () => this._watch(),
            'changed::note-text', () => this.update(),
            'changed::note-bullets', () => this.update(), this);
        this._watch();
        this.connect('destroy', () => {
            this._cancellable.cancel();
            this._monitor?.cancel();
        });
    }

    _watch() {
        this._monitor?.cancel();
        this._monitor = null;
        this._path = notesPath(this._settings);
        if (this._path) {
            this._file = Gio.File.new_for_path(this._path);
            this._monitor = this._file.monitor_file(Gio.FileMonitorFlags.NONE, null);
            this._monitor.connect('changed', () => this.update());
        }
        this.update();
    }

    setRadius(radius, colored) {
        const r = Math.max(0, radius - 1);
        this._header.style = `border-radius: ${r}px ${r}px 0 0;` +
            (colored ? '' : 'background-color: rgba(255, 255, 255, 0.08);');
    }

    _render(text, unix) {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        this._title.text = lines[0] ?? 'No note yet';
        // Lines may already start with "-", "*" or "•"; normalise them so bullets never double up.
        const bullets = this._settings.get_boolean('note-bullets');
        const body = lines.slice(1).map(l => (bullets ? `• ${l.replace(/^[-*•]\s*/, '')}` : l));
        this._text.text = lines.length ? body.join('\n') : 'Write one in the extension settings';
        this._date.text = lines.length && unix ? relativeDate(unix) : '';
    }

    async update() {
        // One save fires several monitor events; only the newest read may render.
        const generation = this._generation = (this._generation ?? 0) + 1;
        if (!this._path) {
            this._render(this._settings.get_string('note-text'), this._settings.get_int64('note-updated'));
            return;
        }
        try {
            const [text, info] = await Promise.all([
                readText(this._path, this._cancellable),
                this._file.query_info_async('time::modified', Gio.FileQueryInfoFlags.NONE,
                    GLib.PRIORITY_DEFAULT, this._cancellable),
            ]);
            if (generation !== this._generation)
                return;
            this._render(text, info.get_modification_date_time().to_unix());
        } catch (e) {
            if (isCancelled(e) || generation !== this._generation)
                return;
            if (!isNotFound(e))
                warn('notes', e.message);
            this._title.text = 'File not found';
            this._text.text = this._path.replace(GLib.get_home_dir(), '~');
            this._date.text = '';
        }
    }
});
