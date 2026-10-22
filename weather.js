import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';

import {CARD, fetchJson, isCancelled, warn} from './utils.js';

// WMO weather codes -> [description, icon base name]
const CODES = [
    [[0], 'Clear', 'weather-clear'],
    [[1, 2], 'Partly Cloudy', 'weather-few-clouds'],
    [[3], 'Cloudy', 'weather-overcast'],
    [[45, 48], 'Fog', 'weather-fog'],
    [[51, 53, 55, 56, 57, 61, 80], 'Light Rain', 'weather-showers-scattered'],
    [[63, 65, 66, 67, 81, 82], 'Rain', 'weather-showers'],
    [[71, 73, 75, 77, 85, 86], 'Snow', 'weather-snow'],
    [[95, 96, 99], 'Thunderstorm', 'weather-storm'],
];

function describe(code, isDay) {
    const [, text, icon] = CODES.find(([codes]) => codes.includes(code)) ?? CODES[2];
    const night = !isDay && (icon === 'weather-clear' || icon === 'weather-few-clouds');
    return [text, `${icon}${night ? '-night' : ''}-symbolic`];
}

export const WeatherWidget = GObject.registerClass({
    Signals: {'restyle': {}},
}, class WeatherWidget extends St.BoxLayout {
    _init(settings) {
        super._init({
            style_class: 'dw-card dw-weather',
            orientation: Clutter.Orientation.VERTICAL,
            width: CARD, height: CARD,
        });
        this.interval = 15 * 60;
        this._settings = settings;
        this._session = new Soup.Session({timeout: 20});
        this._cancellable = new Gio.Cancellable();

        this._city = new St.Label({style_class: 'dw-weather-city', text: 'Weather'});
        this._temp = new St.Label({style_class: 'dw-weather-temp', text: '--°'});
        this._icon = new St.Icon({style_class: 'dw-weather-icon', icon_name: 'weather-overcast-symbolic'});
        this._cond = new St.Label({style_class: 'dw-weather-cond', text: 'Loading…'});
        this._range = new St.Label({style_class: 'dw-weather-range'});
        for (const w of [this._city, this._temp, new St.Widget({y_expand: true}),
            this._icon, this._cond, this._range])
            this.add_child(w);

        settings.connectObject(
            'changed::weather-location', () => {
                this._place = null;
                this.update();
            },
            'changed::temperature-unit', () => this.update(), this);
        this.connect('destroy', () => {
            this._cancellable.cancel();
            this._session.abort();
        });
    }

    async update() {
        // Settings changes start new requests; a generation counter drops answers from older ones.
        const generation = this._generation = (this._generation ?? 0) + 1;
        try {
            const place = this._place ?? await this._locate();
            if (generation !== this._generation)
                return;
            this._place = place;
            const {latitude, longitude, name} = place;
            const data = await fetchJson(this._session,
                'https://api.open-meteo.com/v1/forecast' +
                `?latitude=${latitude}&longitude=${longitude}` +
                '&current=temperature_2m,weather_code,is_day' +
                '&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto' +
                `&temperature_unit=${this._settings.get_string('temperature-unit')}`,
                this._cancellable);
            if (generation !== this._generation)
                return;

            const [text, icon] = describe(data.current.weather_code, data.current.is_day);
            this._city.text = name;
            this._temp.text = `${Math.round(data.current.temperature_2m)}°`;
            this._icon.icon_name = icon;
            this._cond.text = text;
            this._range.text = `H:${Math.round(data.daily.temperature_2m_max[0])}° ` +
                `L:${Math.round(data.daily.temperature_2m_min[0])}°`;
            if (data.current.is_day)
                this.remove_style_class_name('dw-weather-night');
            else
                this.add_style_class_name('dw-weather-night');
            this.emit('restyle');
        } catch (e) {
            if (isCancelled(e) || generation !== this._generation)
                return;
            this._place = null;
            this._cond.text = 'Unavailable';
            warn('weather', e.message);
        }
    }

    // The configured city, or the city from the system timezone (e.g. Asia/Dhaka), so VPNs don't move it.
    async _locate() {
        const city = this._settings.get_string('weather-location').trim() ||
            (GLib.TimeZone.new_local().get_identifier() ?? '').split('/').pop().replace(/_/g, ' ');
        if (!city || city === 'UTC')
            throw new Error('no city set; choose one in the extension settings');
        const {results} = await fetchJson(this._session,
            `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`,
            this._cancellable);
        if (!results?.length)
            throw new Error(`no location found for "${city}"`);
        return results[0];
    }
});
