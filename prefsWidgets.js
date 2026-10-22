import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {CATALOG, defaultColumn} from './catalog.js';
import {buttonRow, colorRow, comboRow, spinRow, switchRow, watch} from './prefsRows.js';

const APPEARANCE_KEYS = ['tint-color', 'glass-opacity', 'colored-widgets', 'show-border',
    'show-shadow', 'corner-radius', 'widget-scale'];
const NAMES = Object.fromEntries(CATALOG.map(([key, name]) => [key, name]));

function readColumns(settings) {
    try {
        return JSON.parse(settings.get_string('widget-columns')) ?? {};
    } catch {
        return {};
    }
}

// Page: which widgets show, how they look, and where they sit.
export function widgetsPage(window, settings) {
    const page = new Adw.PreferencesPage({title: 'Widgets', icon_name: 'view-grid-symbolic'});

    const shown = new Adw.PreferencesGroup({title: 'Show', description: 'Choose which widgets appear'});
    const switches = CATALOG.map(([key, name]) => {
        const row = new Adw.SwitchRow({title: name});
        row.connect('notify::active', () => {
            const visible = settings.get_strv('visible-widgets');
            if (row.active !== visible.includes(key))
                settings.set_strv('visible-widgets', row.active ? [...visible, key] : visible.filter(k => k !== key));
        });
        shown.add(row);
        return [key, row];
    });
    const syncSwitches = () => {
        const visible = settings.get_strv('visible-widgets');
        switches.forEach(([key, row]) => (row.active = visible.includes(key)));
    };
    syncSwitches();
    watch(settings, window, 'visible-widgets', syncSwitches);
    shown.add(spinRow(settings, 'app-count', 'Apps in System Info', 0, 10, 1));
    page.add(shown);

    const look = new Adw.PreferencesGroup({title: 'Appearance'});
    look.add(colorRow(settings, window, 'tint-color', 'Glass color'));
    look.add(spinRow(settings, 'glass-opacity', 'Glass opacity', 0, 0.9, 0.02, 2));
    look.add(switchRow(settings, 'colored-widgets', 'Colored widgets',
        'Tint Weather, Now Playing and Notes with their own colors'));
    look.add(switchRow(settings, 'show-border', 'Border'));
    look.add(switchRow(settings, 'show-shadow', 'Shadow'));
    look.add(spinRow(settings, 'corner-radius', 'Corner roundness', 0, 40, 1));
    look.add(spinRow(settings, 'widget-scale', 'Size', 0.6, 1.6, 0.05, 2));
    look.add(buttonRow('Restore default look', '', 'Reset', () => APPEARANCE_KEYS.forEach(k => settings.reset(k))));
    page.add(look);

    const place = new Adw.PreferencesGroup({title: 'Position',
        description: 'Changing these puts dragged widgets back into place.'});
    place.add(comboRow(settings, window, 'stack-position', 'Position on screen',
        ['top-right', 'top-left', 'bottom-right', 'bottom-left', 'center'],
        ['Top right', 'Top left', 'Bottom right', 'Bottom left', 'Center']));
    place.add(spinRow(settings, 'stack-margin', 'Distance from edge (px)', 0, 600, 10));
    place.add(new Adw.ActionRow({title: 'Move widgets freely',
        subtitle: 'Press Super+Alt+W, drag widgets anywhere, then press Esc'}));
    place.add(buttonRow('Reset positions', 'Put dragged widgets back into their columns', 'Reset',
        () => settings.reset('positions')));
    page.add(place);

    const order = new Adw.PreferencesGroup({title: 'Order and columns',
        description: 'Column 1 sits at the screen edge. Wide widgets take a full row; small cards pair up.'});
    let rows = [];
    const syncOrder = () => {
        rows.forEach(row => order.remove(row));
        const saved = settings.get_strv('widget-order');
        const list = [...saved.filter(k => NAMES[k]), ...CATALOG.map(([k]) => k).filter(k => !saved.includes(k))];
        const columns = readColumns(settings);
        rows = list.map((key, i) => {
            const row = new Adw.ActionRow({title: NAMES[key]});
            const column = new Gtk.DropDown({model: Gtk.StringList.new(['Column 1', 'Column 2', 'Column 3']),
                selected: (Number(columns[key]) || defaultColumn(key)) - 1, valign: Gtk.Align.CENTER});
            column.connect('notify::selected', () => {
                const next = readColumns(settings);
                next[key] = column.selected + 1;
                settings.set_string('widget-columns', JSON.stringify(next));
            });
            row.add_suffix(column);
            for (const [icon, by, tip] of [['go-up-symbolic', -1, 'Move up'], ['go-down-symbolic', 1, 'Move down']]) {
                const button = new Gtk.Button({icon_name: icon, valign: Gtk.Align.CENTER, tooltip_text: tip,
                    css_classes: ['flat'], sensitive: i + by >= 0 && i + by < list.length});
                button.connect('clicked', () => {
                    const next = [...list];
                    [next[i], next[i + by]] = [next[i + by], next[i]];
                    settings.set_strv('widget-order', next);
                });
                row.add_suffix(button);
            }
            order.add(row);
            return row;
        });
    };
    syncOrder();
    watch(settings, window, 'widget-order', syncOrder);
    watch(settings, window, 'widget-columns', syncOrder);
    page.add(order);
    return page;
}
