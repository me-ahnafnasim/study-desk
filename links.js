import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {button, label, parseJson} from './ui.js';
import {WIDE, warn} from './utils.js';

const PAGE_SIZE = 4;

// Only web links are opened, so a saved entry can never launch a local file or another URI handler.
export function safeUrl(text) {
    try {
        const uri = GLib.Uri.parse(text.trim(), GLib.UriFlags.NONE);
        return ['http', 'https'].includes(uri.get_scheme()) ? uri : null;
    } catch {
        return null;
    }
}

const isVideo = host => /(^|\.)(youtube\.com|youtu\.be)$/.test(host ?? '');

// Saved videos and links: headline with the link under it; click to open in the browser.
export const LinksWidget = GObject.registerClass(
class LinksWidget extends St.BoxLayout {
    _init(settings) {
        super._init({style_class: 'dw-card dw-links', orientation: Clutter.Orientation.VERTICAL, width: WIDE});
        this.interval = 0;
        this._settings = settings;
        this._page = 0;
        const head = new St.BoxLayout({style_class: 'dw-links-head'});
        head.add_child(label('Saved videos', 'dw-links-title', {x_expand: true}));
        this._count = label('', 'dw-links-count');
        head.add_child(this._count);
        this._list = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'dw-links-list'});
        this._more = button(this, {label: 'View more', styleClass: 'dw-links-more', x_align: Clutter.ActorAlign.END,
            onClick: () => {
                this._page++;
                this.update();
            }});
        [head, this._list, this._more].forEach(w => this.add_child(w));
        settings.connectObject('changed::links', () => {
            this._page = 0;
            this.update();
        }, this);
    }

    _open(url) {
        try {
            // The click's timestamp lets the browser come to the front instead of opening behind other windows.
            Gio.AppInfo.launch_default_for_uri(url, global.create_app_launch_context(global.get_current_time(), -1));
        } catch (e) {
            warn('links', e.message);
        }
    }

    update() {
        const links = parseJson(this._settings, 'links', [])
            .map(l => ({...l, uri: safeUrl(l.url ?? '')})).filter(l => l.uri);
        const pages = Math.max(1, Math.ceil(links.length / PAGE_SIZE));
        this._page %= pages;
        this._count.text = links.length ? `${links.length}` : '';
        this._dwButtons = [this._more]; // the rows below are rebuilt with fresh buttons
        this._list.destroy_all_children();
        if (!links.length)
            this._list.add_child(label('No links yet. Add YouTube videos in Settings.', 'dw-links-empty'));

        for (const link of links.slice(this._page * PAGE_SIZE, (this._page + 1) * PAGE_SIZE)) {
            const host = link.uri.get_host()?.replace(/^www\./, '') ?? '';
            const box = new St.BoxLayout({style_class: 'dw-links-row', x_expand: true}); // fill the row, left-aligned
            box.add_child(new St.Icon({icon_name: isVideo(host) ? 'media-playback-start-symbolic' : 'web-browser-symbolic',
                style_class: `dw-links-icon${isVideo(host) ? ' dw-links-video' : ''}`, icon_size: 14,
                y_align: Clutter.ActorAlign.CENTER}));
            const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
            const title = label(link.title || host, 'dw-links-headline');
            const url = label(`${host}${link.uri.get_path() ?? ''}`, 'dw-links-url');
            for (const l of [title, url])
                l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            text.add_child(title);
            text.add_child(url);
            box.add_child(text);
            this._list.add_child(button(this, {child: box, styleClass: 'dw-links-button', x_expand: true,
                onClick: () => this._open(link.uri.to_string())}));
        }
        this._more.visible = links.length > PAGE_SIZE;
        this._more.label = this._page + 1 < pages
            ? `View more (${links.length - (this._page + 1) * PAGE_SIZE} more)` : 'Back to start';
    }
});
