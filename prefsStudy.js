import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {WEEKDAYS, listEditor} from './prefsList.js';
import {buttonRow, spinRow, switchRow, toast, watch} from './prefsRows.js';

function readJson(settings, key, fallback) {
    try {
        return JSON.parse(settings.get_string(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

// Page: exams, focus timer, goals, tasks, timetable, sleep and break reminders.
export function studyPage(window, settings) {
    const page = new Adw.PreferencesPage({title: 'Study', icon_name: 'accessories-dictionary-symbolic'});

    listEditor(window, settings, 'exams', {
        title: 'Exam countdown', description: 'Click the card on the desktop to flip between exams.',
        fields: [{name: 'name', title: 'Exam name'}, {name: 'date', title: 'Date (YYYY-MM-DD)', type: 'date'}],
        describe: e => [e.name, e.date], order: (a, b) => a.date.localeCompare(b.date),
    }).forEach(g => page.add(g));

    const focus = new Adw.PreferencesGroup({title: 'Focus timer',
        description: 'Start or pause from the card, or with Super+Alt+F. Finished sessions count toward your goal.'});
    focus.add(spinRow(settings, 'focus-minutes', 'Focus length (minutes)', 1, 180, 5));
    focus.add(spinRow(settings, 'break-minutes', 'Short break (minutes)', 1, 60, 1));
    focus.add(spinRow(settings, 'long-break-minutes', 'Long break after 4 sessions (minutes)', 1, 120, 5));
    focus.add(spinRow(settings, 'daily-goal-minutes', 'Daily study goal (minutes)', 10, 960, 10));
    focus.add(buttonRow('Reset study history', 'Clears the streak and daily totals', 'Reset', () => {
        settings.reset('study-log');
        toast(window, 'Study history cleared');
    }));
    page.add(focus);

    const clearDone = new Gtk.Button({label: 'Clear finished', valign: Gtk.Align.CENTER});
    clearDone.connect('clicked', () =>
        settings.set_string('todos', JSON.stringify(readJson(settings, 'todos', []).filter(t => !t.done))));
    listEditor(window, settings, 'todos', {
        title: 'Tasks', description: 'Tick tasks off right on the desktop card.',
        fields: [{name: 'text', title: 'Task'}, {name: 'due', title: 'Due date (YYYY-MM-DD)', type: 'date', optional: true}],
        describe: t => [t.text, t.due ? `Due ${t.due}` : ''], toggle: 'done', extra: [clearDone],
        order: (a, b) => (a.done - b.done) || (a.due || '9999').localeCompare(b.due || '9999'),
    }).forEach(g => page.add(g));

    listEditor(window, settings, 'timetable', {
        title: 'Class timetable', description: 'Your weekly classes. Times are 24-hour, like 14:30.',
        fields: [{name: 'day', title: 'Day', type: 'day'}, {name: 'title', title: 'Class'},
            {name: 'start', title: 'Starts', type: 'time'}, {name: 'end', title: 'Ends', type: 'time'},
            {name: 'place', title: 'Room', optional: true}],
        describe: c => [c.title, `${WEEKDAYS[c.day]} ${c.start}–${c.end}${c.place ? ` · ${c.place}` : ''}`],
        order: (a, b) => (a.day - b.day) || a.start.localeCompare(b.start),
    }).forEach(g => page.add(g));

    page.add(sleepGroup(window, settings));

    const breaks = new Adw.PreferencesGroup({title: 'Break reminders'});
    breaks.add(switchRow(settings, 'break-reminders', 'Remind me to take breaks',
        'Not while the focus timer is running; five minutes away counts as a break'));
    breaks.add(spinRow(settings, 'break-every-minutes', 'After this many minutes at the screen', 15, 240, 5));
    page.add(breaks);
    return page;
}

function sleepGroup(window, settings) {
    const group = new Adw.PreferencesGroup({title: 'Sleep',
        description: 'Estimated from when your computer sits unused overnight (needs Screen Time in Settings › Wellbeing). ' +
            'If last night looks wrong, correct it here.'});
    group.add(spinRow(settings, 'sleep-goal-hours', 'Sleep goal (hours)', 4, 12, 0.5, 1));
    const bed = new Adw.EntryRow({title: 'Last night: bedtime (24-hour, e.g. 23:30)'});
    const wake = new Adw.EntryRow({title: 'This morning: woke up (e.g. 07:15)'});
    const today = () => GLib.DateTime.new_now_local().format('%F');
    const sync = () => {
        const fixed = readJson(settings, 'sleep-overrides', {})[today()];
        bed.text = fixed?.[0] ?? '';
        wake.text = fixed?.[1] ?? '';
    };
    sync();
    watch(settings, window, 'sleep-overrides', sync);
    const save = new Gtk.Button({label: 'Save', valign: Gtk.Align.CENTER, css_classes: ['suggested-action']});
    save.connect('clicked', () => {
        const times = [bed.text.trim(), wake.text.trim()].map(t => /^(\d{1,2}):(\d{2})$/.exec(t));
        if (times.some(m => !m || Number(m[1]) > 23 || Number(m[2]) > 59)) {
            toast(window, 'Enter both times as HH:MM, like 23:30 and 07:15');
            return;
        }
        const overrides = readJson(settings, 'sleep-overrides', {});
        overrides[today()] = times.map(m => `${m[1].padStart(2, '0')}:${m[2]}`);
        settings.set_string('sleep-overrides', JSON.stringify(overrides));
        toast(window, 'Last night corrected');
    });
    const clear = new Gtk.Button({label: 'Use estimate', valign: Gtk.Align.CENTER});
    clear.connect('clicked', () => {
        const overrides = readJson(settings, 'sleep-overrides', {});
        delete overrides[today()];
        settings.set_string('sleep-overrides', JSON.stringify(overrides));
    });
    const actions = new Adw.ActionRow();
    actions.add_suffix(clear);
    actions.add_suffix(save);
    [bed, wake, actions].forEach(r => group.add(r));
    return group;
}
