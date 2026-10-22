import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {QUOTES} from './quotes.js';
import {WIDE} from './utils.js';

const FADE_MS = 400;

// Custom quotes are stored as "text — author"; the author part is optional.
function parseCustom(line) {
    const match = line.match(/^(.*\S)\s+[—–-]\s+(\S.*)$/); // splits at the last spaced dash
    return match ? [match[1], match[2].trim()] : [line.trim(), ''];
}

export const QuoteWidget = GObject.registerClass(
class QuoteWidget extends St.BoxLayout {
    _init(settings) {
        super._init({
            style_class: 'dw-card dw-quote',
            orientation: Clutter.Orientation.VERTICAL,
            width: WIDE, height: 124,
        });
        this.interval = 0; // rotates on its own timer, whose period comes from the settings
        this._settings = settings;
        this._deck = [];

        this._content = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, y_expand: true});
        this._text = new St.Label({style_class: 'dw-quote-text', y_expand: true});
        this._text.clutter_text.line_wrap = true;
        this._text.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._text.clip_to_allocation = true;
        this._author = new St.Label({style_class: 'dw-quote-author', x_align: Clutter.ActorAlign.END});
        this._content.add_child(this._text);
        this._content.add_child(this._author);
        this.add_child(this._content);

        const reshuffle = () => {
            this._deck = [];
            this.update();
        };
        settings.connectObject(
            'changed::quote-interval', () => this._schedule(),
            'changed::quote-source', reshuffle,
            'changed::custom-quotes', reshuffle, this);
        this._schedule();
        this.connect('destroy', () => this._unschedule());
    }

    _schedule() {
        this._unschedule();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,
            this._settings.get_int('quote-interval'), () => {
                if (this.visible)
                    this.update();
                return GLib.SOURCE_CONTINUE;
            });
    }

    _unschedule() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = 0;
    }

    _quotes() {
        const source = this._settings.get_string('quote-source');
        const custom = this._settings.get_strv('custom-quotes').filter(l => l.trim()).map(parseCustom);
        if (source === 'custom' && custom.length)
            return custom;
        return source === 'builtin' ? QUOTES : [...custom, ...QUOTES];
    }

    // Deals every quote once in random order before repeating, never showing the same one twice in a row.
    _next(quotes) {
        if (!this._deck.length) {
            this._deck = [...quotes.keys()].sort(() => Math.random() - 0.5);
            if (this._deck.length > 1 && quotes[this._deck.at(-1)][0] === this._shown)
                this._deck.unshift(this._deck.pop());
        }
        return quotes[this._deck.pop()] ?? QUOTES[0];
    }

    update() {
        const [text, author] = this._next(this._quotes());
        this._shown = text;
        const show = () => {
            this._text.text = `“${text}”`;
            this._author.text = author ? `— ${author}` : '';
            this._content.ease({opacity: 255, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        };
        if (!this._text.text)
            show();
        else
            this._content.ease({opacity: 0, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: show});
    }
});
