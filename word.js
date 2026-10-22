import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {button, label} from './ui.js';
import {WIDE} from './utils.js';
import {WORDS} from './words.js';

// One academic word per day; click the card for another.
export const WordWidget = GObject.registerClass(
class WordWidget extends St.BoxLayout {
    _init() {
        super._init({style_class: 'dw-card dw-word', width: WIDE});
        this.interval = 60;
        this._offset = 0;

        const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        const head = new St.BoxLayout();
        head.add_child(label('WORD OF THE DAY', 'dw-word-head', {x_expand: true}));
        head.add_child(label('tap for another', 'dw-word-hint'));
        const title = new St.BoxLayout({style_class: 'dw-word-title'});
        this._word = label('', 'dw-word-word');
        this._pos = label('', 'dw-word-pos', {y_align: Clutter.ActorAlign.END});
        title.add_child(this._word);
        title.add_child(this._pos);
        this._meaning = label('', 'dw-word-meaning');
        this._example = label('', 'dw-word-example');
        for (const l of [this._meaning, this._example])
            l.clutter_text.line_wrap = true;
        [head, title, this._meaning, this._example].forEach(w => box.add_child(w));
        this.add_child(button(this, {child: box, styleClass: 'dw-card-button', x_expand: true,
            onClick: () => {
                this._offset++;
                this.update();
            }}));
    }

    update() {
        const now = GLib.DateTime.new_now_local();
        const day = Math.floor((now.to_unix() + now.get_utc_offset() / GLib.TIME_SPAN_SECOND) / 86400); // local day
        if (day !== this._day) {
            this._day = day;
            this._offset = 0; // a new day starts from its own word
        }
        const [word, pos, meaning, example] = WORDS[(day + this._offset) % WORDS.length];
        this._word.text = word;
        this._pos.text = pos;
        this._meaning.text = meaning;
        this._example.text = `“${example}”`;
    }
});
