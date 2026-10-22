# Study Desk

A study dashboard for the GNOME desktop. Exam countdown, Pomodoro focus timer, study streak, tasks,
class timetable, word of the day, saved videos and more, alongside everyday widgets like a clock,
weather and system monitor. Everything is drawn as frosted-glass cards that sit on your desktop,
behind your windows, and you can click them directly.

Requires **GNOME Shell 49**.

## Widgets

### For studying

| Widget | What it shows | On the desktop you can… |
|---|---|---|
| **Exam Countdown** | Days left until each upcoming exam | Click to flip between exams |
| **Focus Timer** | A Pomodoro timer: 25 min focus, 5 min break, a long break after every 4 sessions | Start/pause, reset, skip; or press <kbd>Super</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd> |
| **Study Streak** | Consecutive study days, today's progress toward your daily goal, the last 7 days | – |
| **Word of the Day** | An academic word with its meaning and an example sentence (60 words, useful for IELTS, PTE and GMAT) | Click for another word |
| **Tasks** | Homework and to-dos with due dates; overdue tasks turn red | Tick tasks off |
| **Class Timetable** | The class on now (with time left) and the next one | – |
| **Saved Videos and Links** | YouTube videos and links: headline with the link underneath, four at a time | Click to open in your browser; **View more** to page |
| **Sleep** | Last night's sleep and a 7-night chart, estimated from overnight inactivity | – |

Finished focus sessions count toward your streak and daily goal. Break reminders tell you to
step away after a long unbroken stretch at the screen (they stay quiet while the focus timer runs).

### Everyday

| Widget | What it shows |
|---|---|
| **Motivational Quote** | A new quote every 40 seconds from 50 built-in quotes and/or your own |
| **Clock** | Time (follows your 12/24-hour setting) and date |
| **Now Playing** | Track, artist and album art from any MPRIS player (Spotify, browsers, Rhythmbox…) |
| **Calendar** | This month, starting on your locale's first weekday |
| **Weather** | Temperature, conditions, high and low, from [Open-Meteo](https://open-meteo.com) |
| **Notes** | A note you type in the settings: the first line is the title, the rest are bullet points |
| **Screen Time** | Today's active time with an hourly chart |
| **System Info** | CPU, memory, disk, temperature, battery, uptime, and the apps using the most CPU and memory |

## Install

**From extensions.gnome.org** (once published): open the extension's page and switch it on.

**From a release zip:**

```sh
gnome-extensions install study-desk@me-ahnafnasim.github.io.shell-extension.zip
```

Log out and back in, then switch on **Study Desk** in the Extensions app.

**From source:**

```sh
git clone https://github.com/me-ahnafnasim/study-desk.git \
    ~/.local/share/gnome-shell/extensions/study-desk@me-ahnafnasim.github.io
glib-compile-schemas ~/.local/share/gnome-shell/extensions/study-desk@me-ahnafnasim.github.io/schemas
```

Log out and back in, then switch it on.

## Use

| Action | How |
|---|---|
| Move widgets | Press <kbd>Super</kbd>+<kbd>Alt</kbd>+<kbd>W</kbd>, drag them anywhere, then press <kbd>Esc</kbd> or click empty space. <kbd>R</kbd> resets the layout. |
| Start or pause the focus timer | Click ▶ on the card, or press <kbd>Super</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd> |
| Open the settings | Extensions app › Study Desk › ⚙ |

## Settings

The settings window has three pages.

- **Widgets:** show or hide each widget; glass color, opacity, border, shadow, corner roundness and
  size; position on screen (any corner or the centre) and distance from the edge; widget order and
  which of three columns each widget sits in.
- **Study:** exams; focus, break and long-break lengths; daily study goal; tasks; weekly class
  timetable; sleep goal and corrections for last night; break reminders.
- **Content:** saved videos and links; your note (with bullet points on or off, or a text file
  instead); quote timing and your own quotes; weather city and °C/°F.

Wide widgets take a full row and small cards pair up side by side. A column taller than your screen
continues in an extra column.

## Privacy

- **Weather** is the only feature that uses the network on its own. Every 15 minutes it sends your
  city name (from the settings, or from your system timezone) to Open-Meteo's geocoding API, and the
  city's coordinates to its forecast API. Hide the weather widget to stop all network access.
- **Saved links** open in your browser only when you click them. Only `http` and `https` links are
  accepted.
- Everything else is read locally: `/proc` and `/sys` for system info, D-Bus for media players,
  and GNOME's screen-time history (`~/.local/share/gnome-shell/session-active-history.json`) for
  screen time and the sleep estimate. Nothing is collected or sent anywhere else.

## Notes and limitations

- **Sleep is an estimate.** A computer has no sleep sensor, so Study Desk takes the longest
  stretch of overnight inactivity as your sleep. Correct a wrong night in Settings › Study › Sleep.
- **Screen Time and Sleep** need GNOME's screen-time history: Settings › Wellbeing › Screen Time.
- **Clicking widgets with Desktop Icons (DING):** Study Desk places its widgets just above the
  desktop-icons window and below every app window, so clicks reach the widgets.
- Sizes other than 100% make text slightly soft, because the cards are scaled as images.

## Development

The extension is plain GJS modules, with no build step.

| File | Purpose |
|---|---|
| `extension.js` | Creates the widgets, applies settings, timers, shortcuts |
| `widgets.js`, `catalog.js` | Widget registry; names and default columns |
| `desktopLayer.js` | Keeps the widgets above the desktop icons and below app windows |
| `layout.js` | Packs widgets into rows and columns |
| `editor.js` | Drag-to-move edit mode |
| `*.js` (one per widget) | The widgets themselves |
| `prefs*.js` | The settings window |
| `schemas/` | Settings schema |

Build the zip to upload to extensions.gnome.org:

```sh
./pack.sh
```

On Wayland, GNOME only loads changed extension code at login. To test without logging out, run a
headless shell with its own settings (Fedora needs the `mutter-devel` package):

```sh
XDG_DATA_HOME=/tmp/sd/data XDG_CONFIG_HOME=/tmp/sd/config GSETTINGS_BACKEND=keyfile \
dbus-run-session -- gnome-shell --headless --virtual-monitor 1920x1080 \
    --wayland --no-x11 --wayland-display wayland-test
```

Use `GSETTINGS_BACKEND=keyfile` so the test session never writes to your real settings.

## License

GPL-2.0-or-later © 2026 Ahnaf Nasim. See [LICENSE](LICENSE).
