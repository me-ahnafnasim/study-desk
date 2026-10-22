// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Ahnaf Nasim

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {listEditor} from './prefsList.js';
import {comboRow, entryRow, noteEditor, spinRow, switchRow, watch} from './prefsRows.js';
import {studyPage} from './prefsStudy.js';
import {widgetsPage} from './prefsWidgets.js';

export default class StudyDeskPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(720, 820);
        window.add(widgetsPage(window, settings));
        window.add(studyPage(window, settings));
        window.add(contentPage(window, settings));
    }
}

// Page: what the content widgets show.
function contentPage(window, settings) {
    const page = new Adw.PreferencesPage({title: 'Content', icon_name: 'document-edit-symbolic'});

    listEditor(window, settings, 'links', {
        title: 'Saved videos and links',
        description: 'Each shows its headline with the link underneath; click one on the desktop to open it. ' +
            'Four show at a time, with “View more” for the rest.',
        fields: [{name: 'title', title: 'Headline'}, {name: 'url', title: 'Link (https://…)', type: 'url'}],
        describe: l => [l.title, l.url],
    }).forEach(g => page.add(g));

    const note = new Adw.PreferencesGroup({title: 'Note',
        description: 'Type your note below. The first line is its title. It saves as you type.'});
    note.add(noteEditor(settings, window));
    note.add(switchRow(settings, 'note-bullets', 'Bullet points', 'Show each line after the title as • item'));
    note.add(entryRow(settings, 'notes-file', 'Or show a text file instead (path, e.g. ~/todo.txt)'));
    page.add(note);

    page.add(quotesGroup(window, settings));
    page.add(myQuotesGroup(window, settings));

    const weather = new Adw.PreferencesGroup({title: 'Weather',
        description: 'Forecasts come from Open-Meteo (open-meteo.com). Leave the city empty to use your timezone.'});
    weather.add(entryRow(settings, 'weather-location', 'City'));
    weather.add(comboRow(settings, window, 'temperature-unit', 'Temperature unit',
        ['celsius', 'fahrenheit'], ['Celsius (°C)', 'Fahrenheit (°F)']));
    page.add(weather);
    return page;
}

function quotesGroup(window, settings) {
    const group = new Adw.PreferencesGroup({title: 'Quotes',
        description: 'Add your own as “text — author”. The author is optional.'});
    group.add(spinRow(settings, 'quote-interval', 'Change every (seconds)', 5, 3600, 5));
    group.add(comboRow(settings, window, 'quote-source', 'Show', ['both', 'builtin', 'custom'],
        ['Built-in and my quotes', 'Built-in quotes only (50)', 'My quotes only']));
    const add = new Adw.EntryRow({title: 'Add a quote', show_apply_button: true});
    add.connect('apply', () => {
        if (add.text.trim())
            settings.set_strv('custom-quotes', [...settings.get_strv('custom-quotes'), add.text.trim()]);
        add.text = '';
    });
    group.add(add);
    return group;
}

function myQuotesGroup(window, settings) {
    const group = new Adw.PreferencesGroup({title: 'My quotes'});
    let rows = [];
    const sync = () => {
        rows.forEach(row => group.remove(row));
        const list = settings.get_strv('custom-quotes');
        rows = list.map((text, i) => {
            const row = new Adw.ActionRow({title: GLib.markup_escape_text(text, -1)});
            const remove = new Gtk.Button({icon_name: 'user-trash-symbolic', valign: Gtk.Align.CENTER,
                tooltip_text: 'Remove', css_classes: ['flat']});
            remove.connect('clicked', () => settings.set_strv('custom-quotes', list.filter((_q, j) => j !== i)));
            row.add_suffix(remove);
            group.add(row);
            return row;
        });
        if (!rows.length) {
            const empty = new Adw.ActionRow({title: 'No quotes added yet'});
            group.add(empty);
            rows.push(empty);
        }
    };
    sync();
    watch(settings, window, 'custom-quotes', sync);
    return group;
}
