import { formatoFecha } from '../../control/fechas.js';

const crear = (tag, texto) => {
    const elemento = document.createElement(tag);
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
};

function dato(titulo, valor) {
    const bloque = crear('section');
    const texto = typeof valor === 'string' && valor.trim() ? valor : 'No registrado';
    bloque.append(crear('h4', titulo), crear('p', texto));
    return bloque;
}

function adjunto(ruta) {
    try {
        const url = new URL(ruta);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            const enlace = crear('a', 'Ver adjunto');
            enlace.href = url.href;
            enlace.target = '_blank';
            enlace.rel = 'noopener noreferrer';
            return enlace;
        }
    } catch {
        // Las referencias sin URL absoluta se muestran como texto.
    }
    return dato('Referencia del adjunto', ruta);
}

/** Resumen de una ejecución confirmada; no contiene controles de edición. */
export default class ReportePaso extends HTMLElement {
    connectedCallback() {
        const { paso, ordenes, resultados } = this.datos;
        const contenido = crear('div');
        const persona = paso.idPersonaRol?.idPersona;
        const responsable = [persona?.nombres, persona?.apellidos].filter(Boolean).join(' ');
        contenido.append(
            crear('p', 'Reporte de solo lectura'),
            dato('Responsable', responsable),
            dato('Estado', paso.estado),
            dato('Inicio', formatoFecha(paso.fechaInicio)),
            dato('Finalización', formatoFecha(paso.fechaFin)),
            dato('Atención brindada', paso.valor),
            crear('h3', 'Exámenes y resultados')
        );
        const propias = ordenes.filter(o => o.idConsultaProcedimientoPaso?.idConsultaProcedimientoPaso === paso.idConsultaProcedimientoPaso);
        if (!propias.length) contenido.append(crear('p', 'Este paso no tiene exámenes registrados.'));
        for (const orden of propias) {
            const examen = crear('section');
            examen.className = 'reporte-paso__examen';
            const nombre = typeof orden.indicaciones === 'string' && orden.indicaciones.match(/^(\[[^\]\r\n]+\] \[[^\]\r\n]+\])(?: |$)/)?.[1];
            examen.append(crear('h4', nombre || 'Orden sin examen identificado'), dato('Indicaciones', orden.indicaciones));
            const asociados = resultados.filter(r => r.idOrdenExamen?.idOrdenExamen === orden.idOrdenExamen);
            if (!asociados.length) examen.append(crear('p', 'Sin resultados registrados.'));
            for (const resultado of asociados) {
                const registro = crear('section');
                registro.append(dato('Resultado', resultado.resultado), dato('Interpretación', resultado.interpretacion));
                if (resultado.rutaAtestado) registro.append(adjunto(resultado.rutaAtestado));
                examen.append(registro);
            }
            contenido.append(examen);
        }
        this.replaceChildren(contenido);
    }
}
customElements.define('galeno-reporte-paso', ReportePaso);
