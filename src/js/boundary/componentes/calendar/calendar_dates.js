/** Fechas civiles gregorianas. UTC se usa solo para aritmética, nunca para convertir horas de eventos. */
function utcDate(year, month, day) {
    const date = new Date(0);
    date.setUTCHours(12, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    return date;
}
function key(year, month, day) {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function parseCalendarDate(value) {
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        value = key(value.getFullYear(), value.getMonth() + 1, value.getDate());
    }
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new TypeError('Calendar: fecha inválida; usa YYYY-MM-DD o un Date válido.');
    }
    const [year, month, day] = value.split('-').map(Number);
    const date = utcDate(year, month, day);
    if (year < 1 || year > 9999 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
        throw new TypeError(`Calendar: fecha inexistente (${value}).`);
    }
    return { year, month, day, key: value };
}
export function calendarDateForIntl(value) {
    const { year, month, day } = parseCalendarDate(value);
    return utcDate(year, month, day);
}
export function todayKey() {
    return parseCalendarDate(new Date()).key;
}
export function addDays(value, amount) {
    const date = calendarDateForIntl(value);
    date.setUTCDate(date.getUTCDate() + amount);
    const year = date.getUTCFullYear();
    return year >= 1 && year <= 9999 ? key(year, date.getUTCMonth() + 1, date.getUTCDate()) : null;
}
export function shiftMonth(year, month, amount) {
    const index = (year - 1) * 12 + month - 1 + amount;
    if (index < 0 || index >= 9999 * 12) return null;
    return { year: Math.floor(index / 12) + 1, month: index % 12 + 1 };
}
export function daysInMonth(year, month) {
    parseCalendarDate(key(year, month, 1));
    return utcDate(year, month + 1, 0).getUTCDate();
}
export function addMonths(value, amount) {
    const date = parseCalendarDate(value);
    const next = shiftMonth(date.year, date.month, amount);
    return next ? key(next.year, next.month, Math.min(date.day, daysInMonth(next.year, next.month))) : null;
}
export function weekday(value) {
    return calendarDateForIntl(value).getUTCDay();
}
export function monthDays(year, month, weekStartsOn = 1, showOutsideDays = true) {
    const first = key(year, month, 1);
    const offset = (weekday(first) - weekStartsOn + 7) % 7;
    const length = Math.ceil((offset + daysInMonth(year, month)) / 7) * 7;
    return Array.from({ length }, (_, index) => {
        const date = addDays(first, index - offset);
        if (!date) return null;
        const parsed = parseCalendarDate(date);
        const outside = parsed.month !== month || parsed.year !== year;
        return outside && !showOutsideDays ? null : { ...parsed, outside };
    });
}

export function copyEvents(events) {
    if (!Array.isArray(events)) throw new TypeError('Calendar: events debe ser un arreglo.');
    const ids = new Set();
    return Array.from(events, event => {
        if (!event || typeof event !== 'object' || Array.isArray(event) ||
            !((typeof event.id === 'string' && event.id.trim()) || (typeof event.id === 'number' && Number.isFinite(event.id))) ||
            ids.has(event.id) || typeof event.title !== 'string' || !event.title.trim() || typeof event.date !== 'string') {
            throw new TypeError('Calendar: cada evento requiere id único, title no vacío y date YYYY-MM-DD.');
        }
        parseCalendarDate(event.date);
        const time = event.time ?? '';
        const status = event.status ?? 'default';
        if (typeof time !== 'string' || (time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) ||
            typeof status !== 'string' || !status.trim()) {
            throw new TypeError('Calendar: time debe ser HH:mm y status un texto no vacío.');
        }
        ids.add(event.id);
        return { ...event, time, status };
    });
}
