import { parseCalendarDate, calendarDateForIntl, todayKey, addDays, addMonths, shiftMonth, weekday, monthDays, copyEvents } from './calendar_dates.js';

let sequence = 0;
const defaults = {
    events: [], locale: 'es-SV', weekStartsOn: 1, showOutsideDays: true,
    maxDots: 3, selectable: true, responsive: true, showEventList: true,
    statusColors: { confirmed: '#16a34a', pending: '#f59e0b', cancelled: '#ef4444', default: '#64748b' },
    statusLabels: { confirmed: 'Confirmada', pending: 'Pendiente', cancelled: 'Cancelada', default: 'Sin estado' }
};
function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}
function button(text, command, label = text) {
    const node = element('button', 'calendar__button', text);
    node.type = 'button'; node.dataset.command = command; node.setAttribute('aria-label', label);
    return node;
}

/** Calendario mensual sin servicios, roles ni persistencia. Meses públicos: 1 a 12. */
export default class Calendar {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!(this.container instanceof Element)) throw new Error('Calendar: contenedor inexistente.');
        this.options = { ...defaults, ...options,
            statusColors: { ...defaults.statusColors, ...options.statusColors },
            statusLabels: { ...defaults.statusLabels, ...options.statusLabels } };
        this.validateOptions(options);
        this.events = copyEvents(this.options.events);
        const first = parseCalendarDate(this.options.initialDate ?? todayKey());
        this.year = first.year; this.month = first.month; this.focusDate = first.key;
        this.selectedDate = this.options.selectedDate == null ? null : parseCalendarDate(this.options.selectedDate).key; this.destroyed = false; this.id = `calendar-${++sequence}`;
        const intl = { timeZone: 'UTC', calendar: 'gregory' };
        this.monthFormat = new Intl.DateTimeFormat(this.options.locale, { ...intl, month: 'long', year: 'numeric' });
        this.dateFormat = new Intl.DateTimeFormat(this.options.locale, { ...intl, dateStyle: 'full' });
        this.weekFormat = new Intl.DateTimeFormat(this.options.locale, { ...intl, weekday: 'short' });
        this.weekFullFormat = new Intl.DateTimeFormat(this.options.locale, { ...intl, weekday: 'long' });
        this.indexEvents();
    }

    validateOptions(input) {
        const o = this.options;
        if (typeof o.locale !== 'string' || !o.locale.trim()) throw new TypeError('Calendar: locale debe ser un idioma válido.');
        // Intl lanza RangeError para etiquetas de idioma inválidas.
        new Intl.DateTimeFormat(o.locale);
        if (!Number.isInteger(o.weekStartsOn) || o.weekStartsOn < 0 || o.weekStartsOn > 6 || !Number.isInteger(o.maxDots) || o.maxDots < 0) {
            throw new TypeError('Calendar: weekStartsOn debe ser 0–6 y maxDots un entero >= 0.');
        }
        for (const name of ['showOutsideDays', 'selectable', 'responsive', 'showEventList']) {
            if (typeof o[name] !== 'boolean') throw new TypeError(`Calendar: ${name} debe ser booleano.`);
        }
        for (const name of ['onDateClick', 'onEventClick', 'onMonthChange']) {
            if (o[name] !== undefined && typeof o[name] !== 'function') throw new TypeError(`Calendar: ${name} debe ser una función.`);
        }
        for (const name of ['statusColors', 'statusLabels']) {
            if (input[name] !== undefined && (!input[name] || typeof input[name] !== 'object' || Array.isArray(input[name]))) {
                throw new TypeError(`Calendar: ${name} debe ser un objeto.`);
            }
        }
        if (Object.values(o.statusColors).some(color => typeof color !== 'string' || !CSS.supports('color', color))) {
            throw new TypeError('Calendar: statusColors contiene un color inválido.');
        }
        if (Object.values(o.statusLabels).some(label => typeof label !== 'string' || !label.trim())) {
            throw new TypeError('Calendar: statusLabels debe contener textos no vacíos.');
        }
    }

    assertActive() {
        if (this.destroyed) throw new Error('Calendar: la instancia fue destruida.');
    }

    indexEvents() {
        this.byDate = new Map();
        this.events.forEach(event => {
            if (!this.byDate.has(event.date)) this.byDate.set(event.date, []);
            this.byDate.get(event.date).push(event);
        });
        this.byDate.forEach(events => events.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99')));
    }

    render() {
        this.assertActive();
        if (!this.root) this.mount();
        this.draw(); return this;
    }

    mount() {
        const o = this.options;
        this.root = element('section', `calendar${o.responsive ? ' calendar--responsive' : ''}`);
        const header = element('header', 'calendar__header');
        this.heading = element('h3', 'calendar__heading'); this.heading.id = `${this.id}-month`;
        this.heading.setAttribute('aria-live', 'polite'); this.heading.setAttribute('aria-atomic', 'true');
        const navigation = element('div', 'calendar__navigation'); navigation.setAttribute('role', 'group');
        navigation.setAttribute('aria-label', 'Navegación del calendario');
        this.previousButton = button('‹', 'previous', 'Mes anterior');
        this.nextButton = button('›', 'next', 'Mes siguiente');
        navigation.append(this.previousButton, button('Hoy', 'today'), this.nextButton);
        header.append(this.heading, navigation);
        this.table = element('table', 'calendar__grid'); this.table.setAttribute('aria-labelledby', this.heading.id);
        const weekdays = element('thead', 'calendar__weekdays'); const row = document.createElement('tr');
        for (let i = 0; i < 7; i++) {
            const date = calendarDateForIntl(addDays('2026-11-01', (o.weekStartsOn + i) % 7));
            const th = document.createElement('th'); th.scope = 'col';
            const name = document.createElement('abbr'); name.title = this.weekFullFormat.format(date);
            name.textContent = this.weekFormat.format(date); th.append(name); row.append(th);
        }
        weekdays.append(row); this.body = document.createElement('tbody'); this.table.append(weekdays, this.body);
        this.list = element('section', 'calendar__event-list');
        this.list.setAttribute('aria-labelledby', `${this.id}-selected`);
        this.root.append(header, this.table);
        if (o.showEventList) this.root.append(this.list);
        this.onClick = event => this.handleClick(event);
        this.onKeyDown = event => this.handleKeyDown(event);
        this.root.addEventListener('click', this.onClick);
        this.root.addEventListener('keydown', this.onKeyDown);
        this.container.append(this.root);
    }

    statusLabel(status) {
        return Object.hasOwn(this.options.statusLabels, status) ? this.options.statusLabels[status] : status;
    }

    color(status) {
        return Object.hasOwn(this.options.statusColors, status) ? this.options.statusColors[status] : this.options.statusColors.default;
    }

    draw() {
        const focusedDay = this.root.contains(document.activeElement) ? document.activeElement.dataset.date : null;
        const focusedEvent = this.root.contains(document.activeElement) ? document.activeElement.dataset.event : null;
        const first = `${String(this.year).padStart(4, '0')}-${String(this.month).padStart(2, '0')}-01`;
        const monthText = this.monthFormat.format(calendarDateForIntl(first));
        if (this.heading.textContent !== monthText) this.heading.textContent = monthText;
        this.previousButton.disabled = !shiftMonth(this.year, this.month, -1);
        this.nextButton.disabled = !shiftMonth(this.year, this.month, 1);
        const days = monthDays(this.year, this.month, this.options.weekStartsOn, this.options.showOutsideDays);
        if (!days.some(day => day?.key === this.focusDate)) this.focusDate = first;
        const today = todayKey();
        const fragment = document.createDocumentFragment(); let row;
        days.forEach((day, index) => {
            if (index % 7 === 0) { row = document.createElement('tr'); fragment.append(row); }
            const cell = element('td', 'calendar__cell'); row.append(cell);
            if (!day) return;
            const events = this.byDate.get(day.key) ?? [];
            const control = button('', 'date');
            control.className = 'calendar__day'; control.dataset.date = day.key;
            control.tabIndex = day.key === this.focusDate ? 0 : -1;
            control.classList.toggle('calendar__day--outside', day.outside);
            control.classList.toggle('calendar__day--today', day.key === today);
            control.classList.toggle('calendar__day--selected', day.key === this.selectedDate);
            if (day.key === today) control.setAttribute('aria-current', 'date');
            if (this.options.selectable) control.setAttribute('aria-pressed', String(day.key === this.selectedDate));
            const states = [...new Set(events.map(event => this.statusLabel(event.status)))].join(', ');
            control.setAttribute('aria-label', `${this.dateFormat.format(calendarDateForIntl(day.key))}. ${events.length} ${events.length === 1 ? 'evento' : 'eventos'}${states ? `. ${states}` : ''}`);
            const number = element('span', 'calendar__number', day.day); number.setAttribute('aria-hidden', 'true');
            const dots = element('span', 'calendar__dots'); dots.setAttribute('aria-hidden', 'true');
            events.slice(0, this.options.maxDots).forEach(event => {
                const dot = element('span', 'calendar__dot'); dot.style.backgroundColor = this.color(event.status); dots.append(dot);
            });
            if (events.length > this.options.maxDots) dots.append(element('span', 'calendar__more', `+${events.length - this.options.maxDots}`));
            control.append(number, dots); cell.append(control);
        });
        this.body.replaceChildren(fragment);
        if (this.options.showEventList) this.drawEventList();
        if (focusedDay) this.body.querySelector(`[data-date="${focusedDay}"]`)?.focus();
        if (focusedEvent !== undefined && focusedEvent !== null) {
            [...this.list.querySelectorAll('[data-event]')].find(node => node.dataset.event === focusedEvent)?.focus();
        }
    }

    drawEventList() {
        const heading = element('h4', 'calendar__list-heading', this.selectedDate ?
            this.dateFormat.format(calendarDateForIntl(this.selectedDate)) : 'Eventos del día');
        heading.id = `${this.id}-selected`; heading.setAttribute('aria-live', 'polite');
        this.list.replaceChildren(heading);
        if (!this.selectedDate) {
            this.list.append(element('p', 'calendar__empty', this.options.selectable ?
                'Selecciona una fecha para ver sus eventos.' : 'La selección de fechas está desactivada.'));
            return;
        }
        const events = this.byDate.get(this.selectedDate) ?? [];
        if (!events.length) {
            const empty = element('p', 'calendar__empty', 'No hay eventos para esta fecha');
            empty.setAttribute('role', 'status'); this.list.append(empty); return;
        }
        const list = element('ul', 'calendar__events');
        events.forEach(event => {
            const item = document.createElement('li');
            const control = button('', 'event'); control.className = 'calendar__event';
            // Índice del arreglo original, no una cadena de id insertada en selectores.
            control.dataset.event = this.events.indexOf(event);
            const dot = element('span', 'calendar__dot'); dot.style.backgroundColor = this.color(event.status); dot.setAttribute('aria-hidden', 'true');
            const time = element('span', 'calendar__time', event.time || 'Sin hora');
            control.append(dot, time, element('span', 'calendar__event-title', event.title), element('span', 'calendar__event-status', this.statusLabel(event.status)));
            item.append(control); list.append(item);
        });
        this.list.append(list);
    }

    handleClick(event) {
        const control = event.target.closest('button[data-command]');
        if (!control || control.closest('.calendar') !== this.root || control.disabled) return;
        const command = control.dataset.command;
        if (command === 'previous') this.previousMonth();
        if (command === 'next') this.nextMonth();
        if (command === 'today') this.today();
        if (command === 'date') {
            this.focusDate = control.dataset.date;
            if (!this.options.selectable) return;
            this.selectedDate = control.dataset.date; this.draw();
            this.options.onDateClick?.(this.selectedDate, this.getEventsByDate(this.selectedDate));
        }
        if (command === 'event') this.options.onEventClick?.({ ...this.events[Number(control.dataset.event)] });
    }

    handleKeyDown(event) {
        const control = event.target.closest('button[data-date]');
        if (!control || control.closest('.calendar') !== this.root) return;
        const date = control.dataset.date;
        let target;
        const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (Object.hasOwn(offsets, event.key)) target = addDays(date, offsets[event.key]);
        else if (event.key === 'Home') target = addDays(date, -((weekday(date) - this.options.weekStartsOn + 7) % 7));
        else if (event.key === 'End') target = addDays(date, 6 - ((weekday(date) - this.options.weekStartsOn + 7) % 7));
        else if (event.key === 'PageUp' || event.key === 'PageDown') target = addMonths(date, event.key === 'PageUp' ? -1 : 1);
        else return;
        event.preventDefault();
        if (!target) return;
        const parsed = parseCalendarDate(target);
        const changed = parsed.year !== this.year || parsed.month !== this.month;
        this.focusDate = target; this.year = parsed.year; this.month = parsed.month;
        this.draw(); this.body.querySelector(`[data-date="${target}"]`)?.focus();
        if (changed) this.options.onMonthChange?.(this.year, this.month);
    }

    update(events) {
        this.assertActive();
        const next = copyEvents(events); // Una actualización inválida conserva datos y vista anteriores.
        this.events = next; this.indexEvents(); return this.render();
    }

    addEvent(event) {
        this.assertActive(); return this.update([...this.events, event]);
    }

    removeEvent(id) {
        this.assertActive(); return this.update(this.events.filter(event => event.id !== id));
    }

    goToDate(date) {
        this.assertActive();
        const next = parseCalendarDate(date);
        const changed = next.year !== this.year || next.month !== this.month;
        this.year = next.year; this.month = next.month; this.focusDate = next.key;
        this.render();
        if (changed) this.options.onMonthChange?.(this.year, this.month);
        return this;
    }

    nextMonth() { return this.moveMonth(1); }
    previousMonth() { return this.moveMonth(-1); }
    moveMonth(amount) {
        this.assertActive();
        const next = shiftMonth(this.year, this.month, amount);
        return next ? this.goToDate(`${String(next.year).padStart(4, '0')}-${String(next.month).padStart(2, '0')}-01`) : this;
    }
    today() { this.assertActive(); return this.goToDate(todayKey()); }
    getEventsByDate(date) {
        this.assertActive(); return (this.byDate.get(parseCalendarDate(date).key) ?? []).map(event => ({ ...event }));
    }
    getSelectedDate() { this.assertActive(); return this.selectedDate; }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.root?.removeEventListener('click', this.onClick); this.root?.removeEventListener('keydown', this.onKeyDown);
        this.root?.remove(); this.byDate.clear(); this.events = [];
        this.options = this.container = this.root = this.heading = this.table = this.body = this.list = null;
        this.previousButton = this.nextButton = this.onClick = this.onKeyDown = null;
    }
}
