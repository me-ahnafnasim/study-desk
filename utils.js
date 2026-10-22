import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async');
Gio._promisify(Gio.DBusConnection.prototype, 'call');
Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'query_info_async');
Gio._promisify(Gio.File.prototype, 'query_filesystem_info_async');
Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');

export const CARD = 164;
export const GAP = 16;
export const WIDE = CARD * 2 + GAP;

const decoder = new TextDecoder();

const lastWarning = new Map();

// Logs a widget error once, not on every refresh while the same problem persists.
export function warn(widget, message) {
    if (lastWarning.get(widget) === message)
        return;
    lastWarning.set(widget, message);
    console.warn(`[study-desk] ${widget}: ${message}`);
}

export async function fetchJson(session, url, cancellable) {
    const msg = Soup.Message.new('GET', url);
    const bytes = await session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, cancellable);
    if (msg.get_status() !== Soup.Status.OK)
        throw new Error(`HTTP ${msg.get_status()} from ${GLib.Uri.parse(url, GLib.UriFlags.NONE).get_host()}`);
    return JSON.parse(decoder.decode(bytes.get_data()));
}

export async function readText(path, cancellable = null) {
    const [contents] = await Gio.File.new_for_path(path).load_contents_async(cancellable);
    return decoder.decode(contents);
}

export async function listDir(path, cancellable = null) {
    const names = [];
    const enumerator = await Gio.File.new_for_path(path).enumerate_children_async(
        'standard::name', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);
    for (let infos; (infos = await enumerator.next_files_async(256, GLib.PRIORITY_DEFAULT, cancellable)).length;)
        names.push(...infos.map(info => info.get_name()));
    return names;
}

export function isCancelled(e) {
    return e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

export function isNotFound(e) {
    return e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND);
}

export function formatDuration(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0)
        return m ? `${h}h ${m}m` : `${h}h`;
    return `${m}m`;
}

export function formatBytes(bytes) {
    return bytes < 2 ** 30 ? `${Math.round(bytes / 2 ** 20)} MB` : `${(bytes / 2 ** 30).toFixed(1)} GB`;
}
