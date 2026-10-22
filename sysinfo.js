import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {AppUsage} from './apps.js';
import {WIDE, formatBytes, formatDuration, isCancelled, listDir, readText, warn} from './utils.js';

const APP_SCAN_TICKS = 3; // the app list refreshes every 6 s
const CPU_SENSORS = ['coretemp', 'k10temp', 'zenpower', 'cpu_thermal', 'acpitz'];

async function read(path, cancellable) {
    try {
        return (await readText(path, cancellable)).trim();
    } catch (e) {
        if (isCancelled(e))
            throw e;
        return null;
    }
}

// Finds the CPU temperature input and the first battery once, since hwmon numbering varies per boot.
async function findSources(cancellable) {
    const sources = {sensor: null, battery: null};
    const hwmons = await listDir('/sys/class/hwmon', cancellable).catch(() => []);
    const names = await Promise.all(hwmons.map(h => read(`/sys/class/hwmon/${h}/name`, cancellable)));
    const best = CPU_SENSORS.map(s => names.indexOf(s)).find(i => i >= 0);
    if (best !== undefined)
        sources.sensor = `/sys/class/hwmon/${hwmons[best]}/temp1_input`;

    for (const supply of await listDir('/sys/class/power_supply', cancellable).catch(() => [])) {
        if (await read(`/sys/class/power_supply/${supply}/type`, cancellable) === 'Battery') {
            sources.battery = `/sys/class/power_supply/${supply}`;
            break;
        }
    }
    return sources;
}

function cpuTimes(stat) {
    const fields = stat.split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
    return {idle: fields[3] + fields[4], total: fields.reduce((a, b) => a + b, 0)};
}

export const SysInfoWidget = GObject.registerClass(
class SysInfoWidget extends St.BoxLayout {
    _init() {
        super._init({
            style_class: 'dw-card dw-sysinfo',
            orientation: Clutter.Orientation.VERTICAL,
            width: WIDE,
        });
        this.interval = 2;
        this._cancellable = new Gio.Cancellable();
        this._usage = new AppUsage();

        this.add_child(new St.Label({style_class: 'dw-sys-header', text: GLib.get_host_name()}));
        this._bars = Object.fromEntries(['CPU', 'Memory', 'Disk'].map(name => [name, this._row(name)]));
        this._footer = new St.Label({style_class: 'dw-sys-footer'});
        this.add_child(this._footer);
        this._apps = new St.BoxLayout({style_class: 'dw-apps', orientation: Clutter.Orientation.VERTICAL});
        this.add_child(this._apps);
        this._appRows = []; // built by setAppCount() from the settings

        this.connect('destroy', () => this._cancellable.cancel());
    }

    _row(name) {
        const row = new St.BoxLayout({style_class: 'dw-sys-row'});
        const track = new St.Widget({style_class: 'dw-sys-track', x_expand: true,
            y_align: Clutter.ActorAlign.CENTER});
        const fill = new St.Widget({style_class: `dw-sys-fill dw-sys-${name.toLowerCase()}`});
        track.add_child(fill);
        const value = new St.Label({style_class: 'dw-sys-value'});
        row.add_child(new St.Label({text: name, style_class: 'dw-sys-name'}));
        row.add_child(track);
        row.add_child(value);
        this.add_child(row);
        const bar = {fill, track, value, fraction: 0};
        track.connect('notify::width', () => this._resize(bar));
        return bar;
    }

    _set(name, fraction, text) {
        const bar = this._bars[name];
        bar.fraction = Math.max(0, Math.min(1, fraction));
        bar.value.text = text;
        this._resize(bar);
    }

    _resize(bar) {
        bar.fill.set_size(Math.round(bar.track.width * bar.fraction), bar.track.height);
    }

    setAppCount(count) {
        this._apps.destroy_all_children();
        this._apps.visible = count > 0;
        const header = new St.BoxLayout({style_class: 'dw-apps-row dw-apps-header'});
        for (const [text, style] of [['Apps', 'dw-apps-name'], ['CPU', 'dw-apps-cpu'], ['Memory', 'dw-apps-mem']])
            header.add_child(new St.Label({text, style_class: style, x_expand: style === 'dw-apps-name'}));
        this._apps.add_child(header);

        this._appRows = Array.from({length: count}, () => {
            const row = new St.BoxLayout({style_class: 'dw-apps-row', visible: false});
            const icon = new St.Icon({icon_size: 16});
            const name = new St.Label({style_class: 'dw-apps-name', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
            const cpu = new St.Label({style_class: 'dw-apps-cpu', y_align: Clutter.ActorAlign.CENTER});
            const mem = new St.Label({style_class: 'dw-apps-mem', y_align: Clutter.ActorAlign.CENTER});
            name.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            [icon, name, cpu, mem].forEach(c => row.add_child(c));
            this._apps.add_child(row);
            return {row, icon, name, cpu, mem};
        });
    }

    async update() {
        if (this._busy)
            return;
        this._busy = true;
        try {
            // The /proc scan behind the app list is the costly part, so it runs less often.
            this._tick = ((this._tick ?? 0) + 1) % APP_SCAN_TICKS;
            await Promise.all([this._updateStats(), this._tick === 0 && this._updateApps()]);
        } catch (e) {
            if (!isCancelled(e))
                warn('system', e.message);
        } finally {
            this._busy = false;
        }
    }

    async _updateStats() {
        const c = this._cancellable;
        this._sources ??= await findSources(c);
        const [stat, meminfo, uptime, temp, battery, charging, fs] = await Promise.all([
            readText('/proc/stat', c), readText('/proc/meminfo', c), readText('/proc/uptime', c),
            this._sources.sensor && read(this._sources.sensor, c),
            this._sources.battery && read(`${this._sources.battery}/capacity`, c),
            this._sources.battery && read(`${this._sources.battery}/status`, c),
            Gio.File.new_for_path('/').query_filesystem_info_async(
                'filesystem::size,filesystem::free', GLib.PRIORITY_DEFAULT, c),
        ]);

        const cpu = cpuTimes(stat);
        const total = this._prev ? cpu.total - this._prev.total : 0;
        const busy = total > 0 ? 1 - (cpu.idle - this._prev.idle) / total : 0;
        this._prev = cpu;
        this._set('CPU', busy, `${Math.round(busy * 100)}%`);

        const kb = key => Number(meminfo.match(new RegExp(`${key}:\\s+(\\d+)`))?.[1] ?? 0) * 1024;
        const memTotal = kb('MemTotal');
        const memUsed = memTotal - kb('MemAvailable');
        this._set('Memory', memTotal ? memUsed / memTotal : 0,
            `${(memUsed / 2 ** 30).toFixed(1)} / ${Math.round(memTotal / 2 ** 30)} GB`);

        const size = fs.get_attribute_uint64('filesystem::size');
        const used = size - fs.get_attribute_uint64('filesystem::free');
        this._set('Disk', size ? used / size : 0, `${Math.round(used / 1e9)} / ${Math.round(size / 1e9)} GB`);

        const parts = [];
        if (temp)
            parts.push(`${Math.round(Number(temp) / 1000)}°C`);
        if (battery)
            parts.push(`Battery ${battery}%${charging === 'Charging' ? ' ⚡' : ''}`);
        parts.push(`Up ${formatDuration(Number(uptime.split(' ')[0]))}`);
        this._footer.text = parts.join('   ·   ');
    }

    async _updateApps() {
        if (!this._appRows.length)
            return;
        const apps = await this._usage.sample(this._cancellable);
        this._appRows.forEach((r, i) => {
            const app = apps[i];
            r.row.visible = !!app;
            if (!app)
                return;
            if (app.gicon)
                r.icon.gicon = app.gicon;
            else
                r.icon.icon_name = 'application-x-executable-symbolic';
            r.name.text = app.name;
            const pct = app.cpu * 100;
            r.cpu.text = `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
            r.mem.text = formatBytes(app.memory);
        });
    }
});
