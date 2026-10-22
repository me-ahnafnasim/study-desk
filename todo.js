import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {button, daysBetween, label, parseDate, parseJson} from './ui.js';
import {WIDE} from './utils.js';

const MAX_ROWS = 6;

function dueText(due, today) {
    const when = parseDate(due);
    if (!when)
        return ['', ''];
    const days = daysBetween(today, when);
    if (days < 0)
        return ['Overdue', 'dw-todo-overdue'];
    if (days === 0)
        return ['Today', 'dw-todo-soon'];
    if (days === 1)
        return ['Tomorrow', 'dw-todo-soon'];
    return [days < 7 ? when.format('%A') : when.format('%e %b').trim(), ''];
}

// Homework and tasks; tick them off right on the desktop. Tasks are added in the settings.
export const TodoWidget = GObject.registerClass(
class TodoWidget extends St.BoxLayout {
    _init(settings) {
        super._init({style_class: 'dw-card dw-todo', orientation: Clutter.Orientation.VERTICAL, width: WIDE});
        this.interval = 60;
        this._settings = settings;
        const head = new St.BoxLayout({style_class: 'dw-todo-head'});
        head.add_child(label('Tasks', 'dw-todo-title', {x_expand: true}));
        this._left = label('', 'dw-todo-left');
        head.add_child(this._left);
        this._list = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'dw-todo-list'});
        this.add_child(head);
        this.add_child(this._list);
        settings.connectObject('changed::todos', () => this.update(), this);
    }

    _toggle(index) {
        const todos = parseJson(this._settings, 'todos', []);
        if (todos[index]) {
            todos[index].done = !todos[index].done;
            this._settings.set_string('todos', JSON.stringify(todos));
        }
    }

    update() {
        const now = GLib.DateTime.new_now_local();
        const today = GLib.DateTime.new_local(now.get_year(), now.get_month(), now.get_day_of_month(), 0, 0, 0);
        const todos = parseJson(this._settings, 'todos', []).map((t, index) => ({...t, index}));
        // Open tasks first, soonest due first (undated last); finished tasks at the bottom.
        todos.sort((a, b) => (a.done - b.done) || ((a.due || '9999') < (b.due || '9999') ? -1 : 1));

        const open = todos.filter(t => !t.done).length;
        this._left.text = todos.length ? `${open} left` : '';
        this._dwButtons = []; // the rows below are rebuilt with fresh buttons
        this._list.destroy_all_children();
        if (!todos.length)
            this._list.add_child(label('No tasks yet. Add some in Settings.', 'dw-todo-empty'));

        for (const t of todos.slice(0, MAX_ROWS)) {
            const row = new St.BoxLayout({style_class: 'dw-todo-row'});
            const text = label('', `dw-todo-text${t.done ? ' dw-todo-done' : ''}`, {x_expand: true,
                y_align: Clutter.ActorAlign.CENTER});
            text.clutter_text.set_markup(t.done ? `<s>${GLib.markup_escape_text(t.text, -1)}</s>`
                : GLib.markup_escape_text(t.text, -1));
            text.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            const [due, dueClass] = t.done ? ['', ''] : dueText(t.due, today);
            row.add_child(button(this, {icon: t.done ? 'checkbox-checked-symbolic' : 'checkbox-symbolic',
                styleClass: 'dw-todo-check', onClick: () => this._toggle(t.index)}));
            row.add_child(text);
            row.add_child(label(due, `dw-todo-due ${dueClass}`, {y_align: Clutter.ActorAlign.CENTER}));
            this._list.add_child(row);
        }
        if (todos.length > MAX_ROWS)
            this._list.add_child(label(`+${todos.length - MAX_ROWS} more in Settings`, 'dw-todo-more'));
    }
});
