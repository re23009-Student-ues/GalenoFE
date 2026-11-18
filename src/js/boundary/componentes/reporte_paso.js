import { formatoFecha } from '../../control/fechas.js';

const crear = (tag, texto) => {
    const elemento = document.createElement(tag);
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
};

/** Resumen de una ejecución confirmada; no contiene controles de edición. */
export default class ReportePaso extends HTMLElement {
    connectedCallback() {
        const { paso, ordenes, resultados } = this.datos;
        const contenido = crear('div');
        const dato = (host, titulo, valor) => {
            const bloque = crear('section');
            bloque.append(crear('h4', titulo), crear('p', typeof valor === 'string' && valor.trim() ? valor : 'No registrado'));
            host.append(bloque);
        };
        contenido.append(crear('p', 'Reporte de solo lectura'));
        dato(contenido, 'Responsable', [paso.idPersonaRol?.idPersona?.nombres, paso.idPersonaRol?.idPersona?.apellidos].filter(Boolean).join(' '));
        dato(contenido, 'Estado', paso.estado);
        dato(contenido, 'Inicio', formatoFecha(paso.fechaInicio));
        dato(contenido, 'Finalización', formatoFecha(paso.fechaFin));
        dato(contenido, 'Atención brindada', paso.valor);
        contenido.append(crear('h3', 'Exámenes y resultados'));
        const propias = ordenes.filter(o => o.idConsultaProcedimientoPaso?.idConsultaProcedimientoPaso === paso.idConsultaProcedimientoPaso);
        if (!propias.length) contenido.append(crear('p', 'Este paso no tiene exámenes registrados.'));
        for (const orden of propias) {
            const examen = crear('section');
            examen.className = 'reporte-paso__examen';
            const nombre = typeof orden.indicaciones === 'string' && orden.indicaciones.match(/^(\[[^\]\r\n]+\] \[[^\]\r\n]+\])(?: |$)/)?.[1];
            examen.append(crear('h4', nombre || 'Orden sin examen identificado'));
            dato(examen, 'Indicaciones', orden.indicaciones);
            const asociados = resultados.filter(r => r.idOrdenExamen?.idOrdenExamen === orden.idOrdenExamen);
            if (!asociados.length) examen.append(crear('p', 'Sin resultados registrados.'));
            for (const resultado of asociados) {
                const registro = crear('section');
                dato(registro, 'Resultado', resultado.resultado);
                dato(registro, 'Interpretación', resultado.interpretacion);
                if (resultado.rutaAtestado) {
                    try {
                        const url = new URL(resultado.rutaAtestado);
                        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
                        const enlace = crear('a', 'Ver adjunto');
                        enlace.href = url.href; enlace.target = '_blank'; enlace.rel = 'noopener noreferrer'; registro.append(enlace);
                    } catch { dato(registro, 'Referencia del adjunto', resultado.rutaAtestado); }
                }
                examen.append(registro);
            }
            contenido.append(examen);
        }
        this.replaceChildren(contenido);
    }
}
customElements.define('galeno-reporte-paso', ReportePaso);
