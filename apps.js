import Shell from 'gi://Shell';

import {listDir, readText} from './utils.js';

const PAGE = 4096;
const CONCURRENCY = 12;

// Runs fn over items with at most `size` in flight, so a /proc scan doesn't flood the GIO thread pool.
async function pool(items, size, fn) {
    let next = 0;
    await Promise.all(Array.from({length: Math.min(size, items.length)}, async () => {
        while (next < items.length)
            await fn(items[next++]);
    }));
}

// argv[0]'s basename is friendlier than comm for tools installed as versioned binaries (e.g. "2.1.308").
async function commandName(pid, comm, cancellable) {
    const argv0 = (await readText(`/proc/${pid}/cmdline`, cancellable)).split('\0')[0];
    return argv0.split('/').pop().split(' ')[0] || comm;
}

// Name a process by its systemd unit, the same way GNOME groups launched apps:
// app-flatpak-com.brave.Browser-123.scope -> the Brave desktop app; foo.service -> "foo".
function classify(unit, comm) {
    const app = unit.match(/^app-(?:[^-]+-)?(.+?)(?:-\d+)?(?:@[^.]*)?\.(?:scope|service)$/);
    if (app) {
        const id = app[1].replace(/\\x([0-9a-f]{2})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)));
        const info = Shell.AppSystem.get_default().lookup_app(`${id}.desktop`);
        if (info)
            return {key: id, name: info.get_name(), gicon: info.get_icon()};
    }
    if (unit === 'org.gnome.Shell@wayland.service' || unit === 'org.gnome.Shell@x11.service')
        return {key: unit, name: 'GNOME Shell'};
    if (unit.endsWith('.service') && !unit.startsWith('app-'))
        return {key: unit, name: unit.replace(/@.*|\.service$/g, '').split('.').pop()};
    return {key: `comm:${comm}`, name: comm};
}

// Samples /proc asynchronously and reports CPU (share of the whole machine) and private memory per app.
export class AppUsage {
    constructor() {
        this._pids = new Map(); // "pid:starttime" -> {group, ticks}; start time guards against pid reuse
        this._total = 0;
    }

    async sample(cancellable) {
        const total = (await readText('/proc/stat', cancellable)).split('\n')[0]
            .trim().split(/\s+/).slice(1).reduce((a, b) => a + Number(b), 0);
        const elapsed = this._total ? total - this._total : 0;
        this._total = total;

        const groups = new Map();
        const seen = new Map();
        const pids = (await listDir('/proc', cancellable)).filter(name => /^\d+$/.test(name));
        await pool(pids, CONCURRENCY, async pid => {
            try {
                const stat = await readText(`/proc/${pid}/stat`, cancellable);
                const close = stat.lastIndexOf(')');
                const fields = stat.slice(close + 2).split(' ');
                if (Number(fields[21]) === 0)
                    return; // kernel threads have no resident memory
                const ticks = Number(fields[11]) + Number(fields[12]);
                const id = `${pid}:${fields[19]}`;
                // Private memory (resident minus shared), so multi-process apps aren't overcounted.
                const [, resident, shared] = (await readText(`/proc/${pid}/statm`, cancellable)).split(' ').map(Number);

                const prev = this._pids.get(id);
                const group = prev?.group ?? classify(
                    (await readText(`/proc/${pid}/cgroup`, cancellable)).trim().split('/').pop(),
                    await commandName(pid, stat.slice(stat.indexOf('(') + 1, close), cancellable));
                seen.set(id, {group, ticks});

                const g = groups.get(group.key) ?? {...group, cpu: 0, memory: 0};
                g.cpu += prev && elapsed > 0 ? Math.max(0, ticks - prev.ticks) / elapsed : 0;
                g.memory += Math.max(0, resident - shared) * PAGE;
                groups.set(group.key, g);
            } catch {
                // The process exited while we were reading it.
            }
        });
        cancellable?.set_error_if_cancelled();
        this._pids = seen;

        return [...groups.values()].sort((a, b) =>
            Math.round(b.cpu * 100) - Math.round(a.cpu * 100) || b.memory - a.memory);
    }
}
