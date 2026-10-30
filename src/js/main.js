import { obtenerUsuario, cargarResumen, listarConsultas, cerrarSesion } from "./control/resumen_service.js";
import { formatoFecha, estadoConsulta } from "./control/fechas.js";
import { mostrarLogin } from "./boundary/login.js";

document.addEventListener("DOMContentLoaded", () => {
    // 1. Mapeo de rutas a sus funciones de renderizado y títulos
    const rutas = {
        '/inicio': () => renderizarInicio(),
        '/personas': () => renderizarPersonas(),
        '/consultas': () => renderizarConsultas(),
        '/procedimientos': () => renderizarProcedimientos(),
        '/laboratorio': () => renderizarLaboratorio(),
        '/configuracion': () => renderizarConfiguracion()
    };

    const titulos = {
        '/inicio': 'Resumen',
        '/personas': 'Gestión de Personas',
        '/consultas': 'Agenda Médica',
        '/procedimientos': 'Atención y Procedimientos',
        '/laboratorio': 'Laboratorio',
        '/configuracion': 'Configuración'
    };

    // Colores de la dona (mañana, tarde, noche)
    const COLORES_HORARIO = ['#8fc9f0', '#1a73e8', '#1f3a5f'];

    const contenedorRaiz = document.getElementById('app-root');
    const tituloPagina = document.getElementById('titulo-pagina');
    const btnMenu = document.getElementById('btn-menu-movil');
    const btnSalir = document.getElementById('btn-salir');
    const sidebar = document.querySelector('.sidebar');
    const menuLateral = document.getElementById('menu-lateral');

    let graficaMes = null;   // referencia para destruirla al cambiar de vista
    let usuario = null;      // persona_rol de la sesión actual
    let vistaActual = 0;     // evita que una respuesta tardía pise otra vista

    // 2. Control del menú móvil (Hamburguesa)
    if (btnMenu && sidebar) {
        btnMenu.addEventListener('click', (e) => {
            e.stopPropagation(); // evita que el document lo cierre al instante
            sidebar.classList.toggle('abierta');
        });

        // Cerrar al tocar fuera del sidebar
        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('abierta') && !sidebar.contains(e.target)) {
                sidebar.classList.remove('abierta');
            }
        });
    }

    // 3. Escuchar los clics en el menú lateral y manejar navegación
    if (menuLateral) {
        menuLateral.addEventListener('click', (e) => {
            if (e.target.tagName === 'A') {
                e.preventDefault();

                document.querySelectorAll('#menu-lateral a').forEach(a => a.classList.remove('activo'));
                e.target.classList.add('activo');

                if (window.innerWidth <= 768 && sidebar) {
                    sidebar.classList.remove('abierta');
                }

                const ruta = e.target.getAttribute('data-route');
                navegarA(ruta);
            }
        });
    }

    // 4. Cerrar sesión: vuelve a la pantalla de ingreso
    if (btnSalir) {
        btnSalir.addEventListener('click', () => {
            cerrarSesion();
            entrar();
        });
    }

    function navegarA(ruta) {
        window.history.pushState({}, "", ruta);
        manejarRuta(ruta);
    }

    function manejarRuta(ruta) {
        const rutaValida = rutas[ruta] ? ruta : '/inicio';
        vistaActual++;

        if (graficaMes) {
            graficaMes.destroy();
            graficaMes = null;
        }

        if (tituloPagina) tituloPagina.textContent = titulos[rutaValida];
        if (contenedorRaiz) {
            contenedorRaiz.innerHTML = '';
            rutas[rutaValida]();
        }
    }

    // ---------- Utilidades ----------
    // Los datos vienen de la base: se escapan antes de meterlos en innerHTML
    function esc(texto) {
        return String(texto ?? '').replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    function formatoCorto(fecha) {
        return fecha.toLocaleString('es-SV', { dateStyle: 'medium', timeStyle: 'short' });
    }

    // ---------- Sesión ----------
    // Usa la sesión guardada o muestra el login; luego abre el Resumen
    async function entrar() {
        vistaActual++;                       // cancela cualquier carga pendiente
        contenedorRaiz.innerHTML = '';
        if (sidebar) sidebar.classList.remove('abierta');

        usuario = await obtenerUsuario().catch(err => {
            console.error(err);
            return null;
        });
        if (!usuario) usuario = await mostrarLogin();

        pintarUsuario();
        document.querySelectorAll('#menu-lateral a').forEach(a =>
            a.classList.toggle('activo', a.getAttribute('data-route') === '/inicio'));
        manejarRuta('/inicio');
    }

    function pintarUsuario() {
        const p = usuario.idPersona ?? {};
        document.getElementById('usuario-nombre').textContent =
            `${p.nombres ?? ''} ${p.apellidos ?? ''}`.trim() || 'Sin nombre';
        document.getElementById('usuario-detalle').textContent =
            `${usuario.idRol?.nombre ?? ''} · ${usuario.idClinica?.nombre ?? ''}`;
        document.getElementById('usuario-avatar').textContent =
            `${(p.nombres ?? '?')[0]}${(p.apellidos ?? '')[0] ?? ''}`.toUpperCase();
    }

    // ---------- Vistas ----------
    async function renderizarInicio() {
        const miVista = vistaActual;
        contenedorRaiz.innerHTML = `<p class="aviso">Cargando resumen…</p>`;

        let d;
        try {
            d = await cargarResumen(usuario);
        } catch (err) {
            console.error(err);
            if (miVista !== vistaActual) return;
            contenedorRaiz.innerHTML = `<p class="aviso aviso--error">${esc(err.mensaje ?? 'No se pudo cargar el resumen')}. Revisa que el servidor esté en marcha (puerto 9080).</p>`;
            return;
        }
        if (miVista !== vistaActual) return; // el usuario ya cambió de vista

        const hoy = new Date();
        const mesCorto = hoy.toLocaleDateString('es', { month: 'short' });
        const hoyLargo = hoy.toLocaleDateString('es', { day: 'numeric', month: 'long' });
        const { manana, tarde, noche } = d.porHorario;
        const totalHorario = manana + tarde + noche;

        contenedorRaiz.innerHTML = `
            <section class="stats">
                <article class="stat stat--cielo">
                    <span>Consultas del año</span>
                    <strong>${d.consultasAnio}</strong>
                    <small>${d.anio}</small>
                </article>
                <article class="stat stat--medio">
                    <span>Consultas del mes</span>
                    <strong>${d.consultasMes}</strong>
                    <small>${esc(mesCorto)}</small>
                </article>
                <article class="stat stat--marino">
                    <span>Pacientes atendidos</span>
                    <strong>${d.pacientesAtendidos}</strong>
                    <small>${esc(d.clinica)}</small>
                </article>
                <article class="stat stat--fuerte">
                    <span>Consultas de hoy</span>
                    <strong>${d.consultasHoy}</strong>
                    <small>${esc(hoyLargo)}</small>
                </article>
            </section>

            <section class="dash-grid">
                <div class="panel panel--grafica">
                    <h3>Consultas por mes · ${d.anio}</h3>
                    <div class="grafica-caja"><canvas id="grafica-mes"></canvas></div>
                </div>

                <div class="panel">
                    <h3>Consultas por horario</h3>
                    <div class="dona" style="background: ${gradienteDona(manana, tarde, noche)}">
                        <div class="dona-centro">
                            <strong>${totalHorario}</strong>
                            <small>consultas</small>
                        </div>
                    </div>
                    <div class="leyenda">
                        <span><i style="background:${COLORES_HORARIO[0]}"></i>Mañana · ${manana}</span>
                        <span><i style="background:${COLORES_HORARIO[1]}"></i>Tarde · ${tarde}</span>
                        <span><i style="background:${COLORES_HORARIO[2]}"></i>Noche · ${noche}</span>
                    </div>
                </div>

                <div class="panel panel--proximas">
                    <h3>Próximas consultas</h3>
                    ${d.proximas.length
                        ? `<ul class="lista-proximas">${d.proximas.map(c => `
                            <li><strong>${esc(c.paciente)}</strong><small>${esc(formatoCorto(c.inicio))}</small></li>`).join('')}</ul>`
                        : '<p class="vacio">No hay consultas próximas</p>'}
                </div>

                <div class="panel panel--recientes">
                    <h3>Consultas recientes</h3>
                    ${d.recientes.length
                        ? `<div class="tabla-caja">
                            <table class="tabla">
                                <thead><tr><th>Paciente</th><th>Fecha</th><th>Observaciones</th></tr></thead>
                                <tbody>${d.recientes.map(c => `
                                    <tr>
                                        <td>${esc(c.paciente)}</td>
                                        <td>${esc(formatoCorto(c.inicio))}</td>
                                        <td>${esc(c.observaciones)}</td>
                                    </tr>`).join('')}</tbody>
                            </table>
                        </div>`
                        : '<p class="vacio">Aún no hay consultas registradas</p>'}
                </div>
            </section>`;

        dibujarGraficaMes(d.porMes);
    }

    // Degradado cónico de la dona según los porcentajes
    function gradienteDona(manana, tarde, noche) {
        const total = manana + tarde + noche;
        if (total === 0) return '#e3eaf1';
        const p1 = (manana / total) * 100;
        const p2 = p1 + (tarde / total) * 100;
        const [c1, c2, c3] = COLORES_HORARIO;
        return `conic-gradient(${c1} 0 ${p1}%, ${c2} ${p1}% ${p2}%, ${c3} ${p2}% 100%)`;
    }

    function dibujarGraficaMes(porMes) {
        const canvas = document.getElementById('grafica-mes');
        if (!canvas || typeof Chart === 'undefined') return;

        graficaMes = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
                datasets: [{
                    data: porMes,
                    backgroundColor: '#1a73e8',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } }
            }
        });
    }

    async function renderizarConsultas() {
        const miVista = vistaActual;
        contenedorRaiz.innerHTML = `<p class="aviso">Cargando consultas…</p>`;

        let lista;
        try {
            lista = await listarConsultas(usuario);
        } catch (err) {
            console.error(err);
            if (miVista !== vistaActual) return;
            contenedorRaiz.innerHTML = `<p class="aviso aviso--error">${esc(err.mensaje ?? 'No se pudieron cargar las consultas')}.</p>`;
            return;
        }
        if (miVista !== vistaActual) return;

        if (!lista.length) {
            contenedorRaiz.innerHTML = `<p class="aviso">Aún no hay consultas registradas</p>`;
            return;
        }

        contenedorRaiz.innerHTML = `<div class="lista-consultas">${lista.map(c => {
            const estado = estadoConsulta(c);
            const p = c.idPersonaRol?.idPersona;
            return `
                <article class="tarjeta-consulta">
                    <header>
                        <strong>${esc(formatoFecha(c.fechaInicio))}</strong>
                        <span class="estado estado--${estado.toLowerCase().replace(' ', '-')}">${esc(estado)}</span>
                    </header>
                    <p>Paciente: ${esc(`${p?.nombres ?? ''} ${p?.apellidos ?? ''}`.trim() || 'Sin nombre')}</p>
                    <p class="obs">${esc(c.observaciones || 'Sin observaciones')}</p>
                </article>`;
        }).join('')}</div>`;
    }

    function renderizarPersonas() {
        contenedorRaiz.innerHTML = `<button id="btn-nuevo-paciente" style="margin: 10px 0; padding: 5px 10px;">Nueva Persona</button><div id="lista-pacientes">Cargando...</div>`;
    }
    function renderizarProcedimientos() {
        contenedorRaiz.innerHTML = `<p>Flujos clínicos.</p>`;
    }
    function renderizarLaboratorio() {
        contenedorRaiz.innerHTML = `<p>Resultados.</p>`;
    }
    function renderizarConfiguracion() {
        contenedorRaiz.innerHTML = `<p>Ajustes.</p>`;
    }

    entrar();
});