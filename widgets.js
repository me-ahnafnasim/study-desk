import {CalendarWidget} from './calendar.js';
import {ClockWidget} from './clock.js';
import {CountdownWidget} from './countdown.js';
import {FocusWidget} from './focus.js';
import {LinksWidget} from './links.js';
import {MediaWidget} from './media.js';
import {NotesWidget} from './notes.js';
import {QuoteWidget} from './quote.js';
import {ScreenTimeWidget} from './screentime.js';
import {SleepWidget} from './sleep.js';
import {StreakWidget} from './streak.js';
import {SysInfoWidget} from './sysinfo.js';
import {TimetableWidget} from './timetable.js';
import {TodoWidget} from './todo.js';
import {WeatherWidget} from './weather.js';
import {WordWidget} from './word.js';

// Widget classes by settings key; names and starting columns live in catalog.js.
export const WIDGETS = {
    quote: QuoteWidget, clock: ClockWidget, media: MediaWidget, calendar: CalendarWidget,
    weather: WeatherWidget, notes: NotesWidget, screentime: ScreenTimeWidget, sysinfo: SysInfoWidget,
    countdown: CountdownWidget, focus: FocusWidget, streak: StreakWidget, word: WordWidget,
    todo: TodoWidget, timetable: TimetableWidget, links: LinksWidget, sleep: SleepWidget,
};
