import { listarConsultas } from '../../control/resumen_service.js';
import { formatoCorto, formatoFecha, estadoConsulta } from '../../control/fechas.js';
import { esPaciente } from '../../control/roles.js';
import { DataTable } from '../componentes/data-display/index.js';
import { Calendar } from '../componentes/calendar/index.js';
import { todayKey, calendarDateForIntl } from '../componentes/calendar/calendar_dates.js';
import { cargarInicioPaciente } from '../../control/paciente_agenda.js';

function crear(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

/** Portal personal: se monta en /inicio y /consultas cuando el rol es Paciente. */
class PacienteController extends HTMLElement {
    constructor() {
        super();
        this.usuario = null;
        this.vista = 'inicio';
        this.tabla = null;
        this.calendario = null;
        this.carga = 0;
    }

    connectedCallback() { this.cargar(); }

    disconnectedCallback() {
        this.carga++;
        this.tabla?.destroy();
        this.tabla = null;
        this.calendario?.destroy();
        this.calendario = null;
    }

    async cargar() {
        const carga = ++this.carga;
        this.tabla?.destroy(); this.tabla = null;
        this.calendario?.destroy(); this.calendario = null;
        const aviso = crear('p', 'aviso', 'Cargando tu información…');
        aviso.setAttribute('role', 'status'); this.replaceChildren(aviso);
        if (!esPaciente(this.usuario)) {
            aviso.textContent = 'Esta vista está disponible para pacientes.';
            return;
        }
        try {
            const datos = this.vista === 'consultas' ? await listarConsultas(this.usuario) : await cargarInicioPaciente(this.usuario);
            if (!this.isConnected || carga !== this.carga) return;
            if (this.vista === 'consultas') this.mostrarConsultas(datos);
            else this.mostrarInicio(datos);
        } catch (error) {
            if (!this.isConnected || carga !== this.carga) return;
            this.tabla?.destroy(); this.tabla = null;
            this.calendario?.destroy(); this.calendario = null;
            aviso.classList.add('aviso--error');
            aviso.textContent = error.mensaje ?? error.message ?? 'No se pudo cargar tu información.';
            const reintentar = crear('button', 'paciente__reintentar', 'Reintentar');
            reintentar.type = 'button'; reintentar.addEventListener('click', () => this.cargar(), { once: true });
            this.replaceChildren(aviso, reintentar);
        }
    }

    bienvenida(titulo, descripcion) {
        const header = crear('header', 'paciente__bienvenida');
        header.append(crear('p', 'paciente__etiqueta', 'Portal del paciente'), crear('h2', '', titulo), crear('p', '', descripcion));
        return header;
    }

    mostrarInicio(resumen) {
        const nombre = this.usuario.idPersona?.nombres?.trim() || 'paciente';
        const header = this.bienvenida(`Hola, ${nombre}`, `Este es tu resumen personal en ${resumen.clinica}.`);
        const stats = crear('section', 'stats'); stats.setAttribute('aria-label', 'Resumen de tus consultas');
        [
            ['Mis consultas del año', resumen.consultasAnio, String(resumen.anio), 'stat--marino'],
            ['Mis consultas del mes', resumen.consultasMes, 'Mes actual', 'stat--medio'],
            ['Mis consultas de hoy', resumen.consultasHoy, 'Agenda de hoy', 'stat--cielo']
        ].forEach(([label, value, note, color]) => {
            const card = crear('article', `stat ${color}`);
            card.append(crear('span', '', label), crear('strong', '', value), crear('small', '', note));
            stats.append(card);
        });
        const panels = crear('section', 'paciente__paneles');
        panels.append(this.lista('Mis próximas consultas', resumen.proximas, 'No tienes consultas próximas.'),
            this.lista('Mis consultas recientes', resumen.recientes, 'Todavía no tienes consultas registradas.'));
        const dashboard = crear('div', 'paciente__dashboard');
        const principal = crear('div', 'paciente__principal'); principal.append(stats, panels);
        const agenda = crear('aside', 'paciente__agenda'); agenda.setAttribute('aria-label', 'Calendario de mis citas');
        const calendarContainer = crear('div', 'paciente__calendario');
        const cards = crear('section', 'paciente__citas-dia');
        cards.setAttribute('aria-label', 'Citas de la fecha seleccionada');
        agenda.append(crear('h3', 'paciente__agenda-titulo', 'Mi calendario de citas'), calendarContainer, cards);
        dashboard.append(principal, agenda); this.replaceChildren(header, dashboard);
        const hoy = todayKey();
        this.calendario = new Calendar(calendarContainer, {
            events: resumen.eventos,
            initialDate: hoy, selectedDate: hoy, showEventList: false,
            statusColors: { scheduled: '#2563eb', completed: '#15803d', ongoing: '#a16207' },
            statusLabels: { scheduled: 'Programada', completed: 'Finalizada', ongoing: 'En curso' },
            onDateClick: (date, events) => this.mostrarCitasDia(cards, date, events)
        }).render();
        this.mostrarCitasDia(cards, hoy, this.calendario.getEventsByDate(hoy));
    }

    mostrarCitasDia(container, date, events) {
        const fecha = new Intl.DateTimeFormat('es-SV', { dateStyle: 'full', timeZone: 'UTC' }).format(calendarDateForIntl(date));
        const heading = crear('h3', 'paciente__citas-fecha', `Citas del ${fecha}`);
        heading.setAttribute('aria-live', 'polite');
        container.replaceChildren(heading);
        if (!events.length) {
            const empty = crear('p', 'paciente__citas-vacio', 'No tienes citas para esta fecha.');
            empty.setAttribute('role', 'status'); container.append(empty); return;
        }
        const list = crear('ul', 'paciente__citas-lista');
        events.forEach(event => {
            const item = document.createElement('li');
            const card = crear('article', 'paciente__cita');
            card.append(crear('p', 'paciente__cita-etiqueta', 'Paso del procedimiento'),
                crear('h4', 'paciente__cita-paso', event.paso),
                crear('p', 'paciente__cita-hora', `Hora de la cita: ${event.time || 'Por confirmar'}`),
                crear('p', 'paciente__cita-doctor', `${event.esMedico ? 'Doctor' : 'Responsable'}: ${event.responsable}${!event.esMedico && event.rolResponsable ? ` (${event.rolResponsable})` : ''}`),
                crear('span', 'paciente__cita-estado', event.estado));
            if (event.procedimiento) card.append(crear('p', 'paciente__cita-procedimiento', `Procedimiento: ${event.procedimiento}`));
            item.append(card); list.append(item);
        });
        container.append(list);
    }

    lista(titulo, consultas, emptyText) {
        const panel = crear('article', 'panel'); panel.append(crear('h3', '', titulo));
        if (!consultas.length) { panel.append(crear('p', 'vacio', emptyText)); return panel; }
        const list = crear('ul', 'paciente__consultas');
        consultas.forEach(consulta => {
            const item = document.createElement('li');
            item.append(crear('strong', '', formatoCorto(consulta.inicio)),
                crear('p', '', consulta.observaciones || 'Sin observaciones registradas.'));
            list.append(item);
        });
        panel.append(list); return panel;
    }

    mostrarConsultas(consultas) {
        const header = this.bienvenida('Mis consultas', 'Consulta las fechas, el estado y las observaciones de tu atención en esta clínica.');
        const container = crear('div', 'paciente__tabla');
        this.replaceChildren(header, container);
        this.tabla = new DataTable(container, {
            title: 'Mi historial de consultas',
            columns: [
                { key: 'fechaInicio', label: 'Fecha', type: 'date', sortable: true, formatter: formatoFecha },
                { key: 'estado', label: 'Estado', sortable: true },
                { key: 'observaciones', label: 'Observaciones', formatter: value => value || 'Sin observaciones registradas.' }
            ],
            // Las fechas del backend pueden incluir [America/El_Salvador].
            data: consultas.map(consulta => ({
                fechaInicio: consulta.fechaInicio?.replace(/\[.*\]$/, ''),
                estado: estadoConsulta(consulta), observaciones: consulta.observaciones
            })),
            pageSize: 5, searchable: true, selectable: false, actions: []
        }).render();
    }
}

customElements.define('paciente-controller', PacienteController);
export default PacienteController;
