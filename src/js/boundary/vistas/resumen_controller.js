import { BarChart } from "../componentes/charts/index.js";
import { cargarResumen } from "../../control/resumen_service.js";
import { formatoCorto } from "../../control/fechas.js";
import { esc } from "../util_html.js";

// Colores de la dona (mañana, tarde, noche)
const COLORES_HORARIO = ['#8fc9f0', '#1a73e8', '#1f3a5f'];

/**
 * Pantalla "Resumen": tarjetas de estadísticas, gráfica por mes, dona por horario,
 * próximas consultas y consultas recientes.
 * Uso: <resumen-controller>, con la propiedad `usuario` asignada antes de conectarlo.
 */
class ResumenController extends HTMLElement {
    constructor() {
        super();
        this.usuario = null;   // persona_rol de la sesión
        this.grafica = null;
    }

    connectedCallback() {
        this.cargar();
    }

    // Al salir de la pantalla se libera la gráfica
    disconnectedCallback() {
        this.grafica?.destroy();
        this.grafica = null;
    }

    async cargar() {
        this.grafica?.destroy();
        this.grafica = null;
        this.innerHTML = `<p class="aviso">Cargando resumen…</p>`;

        let d;
        try {
            d = await cargarResumen(this.usuario);
        } catch (err) {
            console.error(err);
            if (!this.isConnected) return;
            this.innerHTML = `<p class="aviso aviso--error">${esc(err.mensaje ?? 'No se pudo cargar el resumen')}. Revisa que el servidor esté en marcha (puerto 9080).</p>`;
            return;
        }
        if (!this.isConnected) return;   // el usuario ya cambió de pantalla

        const hoy = new Date();
        const mesCorto = hoy.toLocaleDateString('es', { month: 'short' });
        const hoyLargo = hoy.toLocaleDateString('es', { day: 'numeric', month: 'long' });
        const { manana, tarde, noche } = d.porHorario;
        const totalHorario = manana + tarde + noche;

        this.innerHTML = `
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
                    <div id="grafica-mes"></div>
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

        this.grafica = dibujarGraficaMes(this.querySelector('#grafica-mes'), d.porMes);
    }
}

/** Degradado cónico de la dona según los porcentajes. */
function gradienteDona(manana, tarde, noche) {
    const total = manana + tarde + noche;
    if (total === 0) return '#e3eaf1';
    const p1 = (manana / total) * 100;
    const p2 = p1 + (tarde / total) * 100;
    const [c1, c2, c3] = COLORES_HORARIO;
    return `conic-gradient(${c1} 0 ${p1}%, ${c2} ${p1}% ${p2}%, ${c3} ${p2}% 100%)`;
}

/** Adaptación de los datos del servicio a la interfaz del componente. */
function dibujarGraficaMes(container, porMes) {
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return new BarChart(container, {
        data: porMes.map((value, index) => ({ label: meses[index], value })),
       height: 260, colors: ['#1a73e8']
    }).render();
}

customElements.define("resumen-controller", ResumenController);
export default ResumenController;