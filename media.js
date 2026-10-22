import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {CARD, isCancelled} from './utils.js';

const PREFIX = 'org.mpris.MediaPlayer2.';
const RANK = {Playing: 2, Paused: 1};

async function call(bus, iface, method, params, type, cancellable) {
    const reply = await Gio.DBus.session.call(bus, bus === 'org.freedesktop.DBus'
        ? '/org/freedesktop/DBus' : '/org/mpris/MediaPlayer2', iface, method, params,
    new GLib.VariantType(type), Gio.DBusCallFlags.NONE, 2000, cancellable);
    return reply.recursiveUnpack()[0];
}

export const MediaWidget = GObject.registerClass(
class MediaWidget extends St.BoxLayout {
    _init() {
        super._init({
            style_class: 'dw-card dw-media',
            orientation: Clutter.Orientation.VERTICAL,
            width: CARD, height: CARD,
        });
        this.interval = 3;
        this._cancellable = new Gio.Cancellable();

        const top = new St.BoxLayout();
        this._artIcon = new St.Icon();
        this._art = new St.Bin({style_class: 'dw-media-art', child: this._artIcon});
        this._state = new St.Icon({style_class: 'dw-media-state', icon_name: 'media-playback-pause-symbolic',
            x_expand: true, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.START});
        top.add_child(this._art);
        top.add_child(this._state);

        this._title = new St.Label({style_class: 'dw-media-title', text: 'Nothing Playing'});
        this._title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._artist = new St.Label({style_class: 'dw-media-artist', text: 'Play music or a video to see it here'});
        this._artist.clutter_text.line_wrap = true;
        this._artist.clutter_text.ellipsize = Pango.EllipsizeMode.END;

        for (const w of [top, new St.Widget({y_expand: true}), this._title, this._artist])
            this.add_child(w);
        this._show(null);
        this.connect('destroy', () => this._cancellable.cancel());
    }

    async update() {
        if (this._busy)
            return;
        this._busy = true;
        try {
            const names = await call('org.freedesktop.DBus', 'org.freedesktop.DBus', 'ListNames',
                null, '(as)', this._cancellable);
            let best = null;
            for (const name of names.filter(n => n.startsWith(PREFIX))) {
                try {
                    const props = await call(name, 'org.freedesktop.DBus.Properties', 'GetAll',
                        new GLib.Variant('(s)', ['org.mpris.MediaPlayer2.Player']), '(a{sv})', this._cancellable);
                    const rank = RANK[props.PlaybackStatus] ?? 0;
                    if (rank > 0 && props.Metadata?.['xesam:title'] && rank > (best?.rank ?? 0))
                        best = {rank, ...props};
                } catch (e) {
                    if (isCancelled(e))
                        throw e;
                }
            }
            this._show(best);
        } catch (e) {
            if (!isCancelled(e))
                console.debug(`[study-desk] media: ${e.message}`);
        } finally {
            this._busy = false;
        }
    }

    _show(player) {
        const meta = player?.Metadata ?? {};
        const artist = [].concat(meta['xesam:artist'] ?? []).join(', ');
        this._title.text = meta['xesam:title'] ?? 'Nothing Playing';
        this._artist.text = player ? artist || meta['xesam:album'] || '' : 'Play music or a video to see it here';
        this._state.visible = !!player;
        this._state.icon_name = player?.PlaybackStatus === 'Playing'
            ? 'media-playback-start-symbolic' : 'media-playback-pause-symbolic';

        const art = meta['mpris:artUrl'];
        if (typeof art === 'string' && art.startsWith('file://')) {
            this._artIcon.set({gicon: new Gio.FileIcon({file: Gio.File.new_for_uri(art)}), icon_size: 62});
        } else {
            this._artIcon.set({gicon: null, icon_name: 'audio-x-generic-symbolic', icon_size: 26});
        }
    }
});
