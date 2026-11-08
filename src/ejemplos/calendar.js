import { Calendar } from '../js/boundary/componentes/calendar/index.js';

const events = [
    { id: 1, title: 'Consulta general', date: '2026-11-12', time: '09:00', status: 'confirmed' },
    { id: 2, title: 'Consulta de seguimiento', date: '2026-11-12', time: '14:30', status: 'pending' },
    { id: 3, title: 'Control médico', date: '2026-11-18', time: '10:00', status: 'cancelled' },
    { id: 4, title: 'Revisión de resultados', date: '2026-11-12', time: '15:00', status: 'confirmed' },
    { id: 5, title: 'Seguimiento programado', date: '2026-11-12', time: '16:00', status: 'pending' }
];
const feedback = document.querySelector('#calendar-feedback');
const calendar = new Calendar('#appointmentsCalendar', {
    initialDate: '2026-11-12', events, locale: 'es-SV', weekStartsOn: 1,
    showOutsideDays: true, maxDots: 3, selectable: true, responsive: true, showEventList: true,
    statusColors: { confirmed: '#16a34a', pending: '#f59e0b', cancelled: '#ef4444' },
    onDateClick: (date, events) => { feedback.textContent = `${date}: ${events.length} eventos.`; },
    onEventClick: event => { feedback.textContent = `${event.time || 'Sin hora'} · ${event.title}`; },
    onMonthChange: (year, month) => { feedback.textContent = `Mes visible: ${month}/${year}`; }
}).render();
const agenda = new Calendar('#agendaCalendar', {
    initialDate: '2026-11-12', events, showEventList: false,
    onDateClick: (date, events) => {
        document.querySelector('#external-events').textContent = `${date}: ${events.map(event => `${event.time || 'Sin hora'} ${event.title}`).join(' · ') || 'No hay eventos para esta fecha'}`;
    }
}).render();
let nextId = 100;
let lastAdded;
let disposed = false;
let pendingRequest;
document.querySelector('#add-event').addEventListener('click', () => {
    lastAdded = nextId++;
    calendar.addEvent({ id: lastAdded, title: 'Nueva cita ficticia', date: '2026-11-12', time: '17:00', status: 'pending' });
});
document.querySelector('#remove-event').addEventListener('click', () => {
    if (lastAdded !== undefined) calendar.removeEvent(lastAdded);
});
document.querySelector('#update-events').addEventListener('click', () => calendar.update(events.map(event => ({ ...event, status: 'confirmed' }))));
function dispose() {
    disposed = true; pendingRequest?.abort(); calendar.destroy(); agenda.destroy();
    document.querySelectorAll('.calendar-demo__controls button').forEach(button => { button.disabled = true; });
}
document.querySelector('#destroy-calendars').addEventListener('click', dispose);

// Adaptación explícita para el formato actual de Consulta del proyecto.
// Conserva la fecha y hora escritas por el servidor, sin convertir zonas horarias.
// El modelo Consulta no aporta estados confirmed/pending/cancelled: se usa default.
export function consultaToEvent(consulta) {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(consulta.fechaInicio ?? '');
    if (!match) throw new TypeError('La consulta no contiene una fecha/hora reconocible.');
    return { id: consulta.idConsulta, title: consulta.observaciones || 'Consulta médica', date: match[1], time: match[2], status: 'default' };
}

// No se invoca automáticamente ni se asume que exista un endpoint concreto.
// La página proporciona una URL autorizada y, si hace falta, un adaptador como consultaToEvent.
export async function loadAppointments(endpoint, mapEvent = item => ({
    id: item.id, title: item.title, date: item.date, time: item.time, status: item.status
})) {
    if (disposed) return;
    pendingRequest?.abort();
    const request = new AbortController(); pendingRequest = request;
    try {
        const response = await fetch(endpoint, { signal: request.signal });
        if (!response.ok) throw new Error('Error al cargar citas');
        const appointments = await response.json();
        if (!Array.isArray(appointments)) throw new TypeError('Se esperaba un arreglo de citas.');
        if (!disposed && request === pendingRequest) calendar.update(appointments.map(mapEvent));
    } catch (error) {
        if (!disposed && request === pendingRequest && error.name !== 'AbortError') feedback.textContent = error.message;
    }
}
// loadAppointments('/ruta-real-del-backend');
// loadAppointments('/ruta-real-de-consultas', consultaToEvent);
window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); });
