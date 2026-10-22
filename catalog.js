// Every widget's settings key, display name and starting column (1 = at the screen edge). Shared by
// the extension and the preferences window, so it must not import Shell libraries.
export const CATALOG = [
    ['quote', 'Motivational Quote', 1], ['clock', 'Clock', 1], ['media', 'Now Playing', 1],
    ['calendar', 'Calendar', 1], ['weather', 'Weather', 1], ['notes', 'Notes', 1],
    ['screentime', 'Screen Time', 1], ['sysinfo', 'System Info', 1],
    ['countdown', 'Exam Countdown', 2], ['focus', 'Focus Timer', 2], ['streak', 'Study Streak', 2],
    ['word', 'Word of the Day', 2], ['todo', 'Tasks', 2], ['timetable', 'Class Timetable', 2],
    ['links', 'Saved Videos and Links', 2], ['sleep', 'Sleep', 2],
];

export const defaultColumn = key => CATALOG.find(([k]) => k === key)?.[2] ?? 1;
