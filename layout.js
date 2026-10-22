import {CARD, GAP, WIDE} from './utils.js';

// Packs widgets, in order, into rows: a wide widget alone, small cards in pairs.
function pack(widgets) {
    const rows = [];
    for (const w of widgets) {
        const last = rows.at(-1);
        if (w.width <= CARD && last?.length === 1 && last[0].width <= CARD)
            last.push(w);
        else
            rows.push([w]);
    }
    return rows;
}

// Lays widgets out in columns (column 1 at the anchored screen edge, later ones further in). A column
// taller than the screen continues in an extra column. Returns a Map of widget -> [x, y].
export function stackLayout(widgets, {anchor, margin, scale, area, columnOf}) {
    const [vertical, horizontal] = anchor === 'center' ? ['center', 'center'] : anchor.split('-');
    const gap = GAP * scale;
    const maxHeight = area.height - 2 * margin;
    const rowHeight = row => Math.max(...row.map(w => w.height)) * scale;

    const columns = [];
    const groups = [...new Set(widgets.map(columnOf))].sort((a, b) => a - b);
    for (const group of groups) {
        let column = [];
        let height = 0;
        for (const row of pack(widgets.filter(w => columnOf(w) === group))) {
            if (column.length && height + gap + rowHeight(row) > maxHeight) {
                columns.push(column);
                column = [];
                height = 0;
            }
            height += (column.length ? gap : 0) + rowHeight(row);
            column.push(row);
        }
        columns.push(column);
    }

    const step = WIDE * scale + gap;
    const totalWidth = columns.length * step - gap;
    const positions = new Map();
    columns.forEach((rows, i) => {
        const height = rows.reduce((sum, row) => sum + rowHeight(row), 0) + gap * (rows.length - 1);
        const x = {
            left: area.x + margin + i * step,
            right: area.x + area.width - margin - WIDE * scale - i * step,
            center: area.x + (area.width - totalWidth) / 2 + i * step,
        }[horizontal];
        let y = {
            top: area.y + margin,
            bottom: area.y + area.height - margin - height,
            center: area.y + (area.height - height) / 2,
        }[vertical];
        y = Math.max(area.y, y); // never start above the screen
        for (const row of rows) {
            row.forEach((w, col) => positions.set(w, [Math.round(x + col * (CARD + GAP) * scale), Math.round(y)]));
            y += rowHeight(row) + gap;
        }
    });
    return positions;
}
