import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {toast, watch} from './prefsRows.js';

export const WEEKDAYS = Array.from({length: 7}, (_, i) =>
    GLib.DateTime.new_local(2023, 1, 1 + i, 0, 0, 0).format('%A')); // Sunday first

// Field checks: each returns [value, error].
const CHECKS = {
    text: v => (v ? [v, null] : [null, 'is required']),
    date: v => {
        const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
        const d = m && GLib.DateTime.new_local(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, 0);
        return d ? [d.format('%F'), null] : [null, 'must be a date like 2026-12-31'];
    },
    time: v => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(v);
        return m && Number(m[1]) < 24 && Number(m[2]) < 60
            ? [`${m[1].padStart(2, '0')}:${m[2]}`, null] : [null, 'must be a 24-hour time like 09:30'];
    },
    url: v => {
        if (!/^[a-z][a-z0-9+.-]*:/i.test(v))
            v = `https://${v}`; // "youtube.com/watch?v=…" is fine too
        try {
            const uri = GLib.Uri.parse(v, GLib.UriFlags.NONE);
            if (['http', 'https'].includes(uri.get_scheme()))
                return [v, null];
        } catch {}
        return [null, 'must be a web link, like youtube.com/watch?v=…'];
    },
};

function readList(settings, key) {
    try {
        const list = JSON.parse(settings.get_string(key));
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

// An "add" form plus a list with delete buttons for a JSON-array setting.
// fields: [{name, title, type: text|date|time|url|day, optional}]; describe(item) -> [title, subtitle].
export function listEditor(window, settings, key, {title, description, fields, describe, order, toggle, extra, addLabel = 'Add'}) {
    const form = new Adw.PreferencesGroup({title, description});
    const inputs = fields.map(field => {
        if (field.type === 'day') {
            const row = new Adw.ComboRow({title: field.title, model: Gtk.StringList.new(WEEKDAYS),
                selected: GLib.DateTime.new_now_local().get_day_of_week() % 7});
            form.add(row);
            return {field, read: () => row.selected, clear: () => {}};
        }
        const row = new Adw.EntryRow({title: `${field.title}${field.optional ? ' (optional)' : ''}`});
        row.connect('changed', () => row.remove_css_class('error'));
        row.connect('entry-activated', () => submit()); // Enter saves too
        form.add(row);
        return {field, row, read: () => row.text.trim(), clear: () => (row.text = '')};
    });

    const submit = () => {
        const item = {};
        for (const {field, read, row} of inputs) {
            const raw = read();
            if (field.type === 'day') {
                item[field.name] = raw;
                continue;
            }
            if (!raw && field.optional) {
                item[field.name] = '';
                continue;
            }
            const [value, error] = CHECKS[field.type ?? 'text'](raw);
            if (error) {
                row?.add_css_class('error');
                row?.grab_focus();
                toast(window, `${field.title} ${error}`);
                return;
            }
            item[field.name] = value;
        }
        settings.set_string(key, JSON.stringify([...readList(settings, key), item]));
        inputs.forEach(i => i.clear());
        toast(window, 'Saved');
    };
    const add = new Gtk.Button({label: addLabel, valign: Gtk.Align.CENTER, css_classes: ['suggested-action']});
    add.connect('clicked', submit);
    const addRow = new Adw.ActionRow();
    addRow.add_suffix(add);
    extra?.forEach(button => addRow.add_prefix(button));
    form.add(addRow);

    const list = new Adw.PreferencesGroup();
    let rows = [];
    const sync = () => {
        rows.forEach(row => list.remove(row));
        const items = readList(settings, key).map((item, index) => ({item, index}));
        if (order)
            items.sort((a, b) => order(a.item, b.item));
        rows = items.map(({item, index}) => {
            const [rowTitle, subtitle] = describe(item);
            const row = new Adw.ActionRow({title: GLib.markup_escape_text(rowTitle, -1),
                subtitle: GLib.markup_escape_text(subtitle ?? '', -1)});
            if (toggle) {
                const check = new Gtk.CheckButton({active: !!item[toggle], valign: Gtk.Align.CENTER});
                check.connect('toggled', () => {
                    const next = readList(settings, key);
                    next[index][toggle] = check.active;
                    settings.set_string(key, JSON.stringify(next));
                });
                row.add_prefix(check);
            }
            const remove = new Gtk.Button({icon_name: 'user-trash-symbolic', valign: Gtk.Align.CENTER,
                tooltip_text: 'Remove', css_classes: ['flat']});
            remove.connect('clicked', () =>
                settings.set_string(key, JSON.stringify(readList(settings, key).filter((_x, i) => i !== index))));
            row.add_suffix(remove);
            list.add(row);
            return row;
        });
        if (!rows.length) {
            const empty = new Adw.ActionRow({title: 'Nothing added yet'});
            list.add(empty);
            rows.push(empty);
        }
    };
    sync();
    watch(settings, window, key, sync);
    return [form, list];
}
