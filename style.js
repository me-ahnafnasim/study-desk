// Turns the appearance settings into per-widget inline styles and classes.

const GRADIENTS = {
    weather: ['58, 143, 217', '123, 184, 232'],
    weatherNight: ['15, 28, 61', '51, 70, 122'],
    media: ['180, 92, 230', '125, 59, 201'],
};

function rgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16) || 0;
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function background(widget, settings) {
    const alpha = settings.get_double('glass-opacity');
    let gradient = settings.get_boolean('colored-widgets') && GRADIENTS[widget._dwKey];
    if (gradient && widget._dwKey === 'weather' && widget.has_style_class_name('dw-weather-night'))
        gradient = GRADIENTS.weatherNight;
    if (!gradient)
        return `background-color: rgba(${rgb(settings.get_string('tint-color'))}, ${alpha});`;

    const strong = Math.min(1, alpha * 3.5), soft = Math.min(1, alpha * 2);
    return 'background-gradient-direction: vertical; ' +
        `background-gradient-start: rgba(${gradient[0]}, ${strong}); ` +
        `background-gradient-end: rgba(${gradient[1]}, ${soft});`;
}

export function applyStyle(widget, settings) {
    const radius = settings.get_int('corner-radius');
    // The clock keeps its slightly squarer shape.
    const r = widget._dwKey === 'clock' ? Math.round(radius * 0.72) : radius;
    widget.style = `${background(widget, settings)} border-radius: ${r}px;`;
    widget.setRadius?.(r, settings.get_boolean('colored-widgets'));

    const toggle = (cls, on) => on ? widget.add_style_class_name(cls) : widget.remove_style_class_name(cls);
    toggle('dw-border', settings.get_boolean('show-border'));
    toggle('dw-shadow', settings.get_boolean('show-shadow'));
}
