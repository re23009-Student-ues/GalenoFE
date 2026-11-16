import DefaultService from './default_service.js';

import { ejecucionesParaConsultas, listarPorConjunto } from './agenda_service.js';

/** Paginación filtrada por conjuntos de consultas. */
export default class ConsultaProcedimientoPasoService extends DefaultService {
    constructor() {
        super();
        this.URL += 'consulta_procedimiento_paso';
    }

    async listarParaConsultas(idsConsultas) {
        return ejecucionesParaConsultas(idsConsultas);
    }
    /** Resúmenes de lectura: no se convierten en ejecuciones para el Wizard. */
    async resumirParaConsultas(idsConsultas) {
        const filas = await listarPorConjunto('consulta/estados', 'idConsulta', 'consultas', idsConsultas,
            (fila, bloque) => bloque.has(fila.idConsulta));
        if (filas.length !== new Set(idsConsultas).size) throw new Error('No se pudieron verificar todas las consultas');
        for (const fila of filas) {
            if (!Number.isSafeInteger(fila.totalPasos) || !Number.isSafeInteger(fila.pasosFinalizados) ||
                    fila.totalPasos < 0 || fila.pasosFinalizados < 0 || fila.pasosFinalizados > fila.totalPasos ||
                    !['Programada', 'En curso', 'Finalizada'].includes(fila.estado) ||
                    !Number.isFinite(Date.parse(fila.evaluadoEn)) ||
                    (fila.estado === 'Finalizada') !== (fila.totalPasos > 0 && fila.totalPasos === fila.pasosFinalizados)) {
                throw new Error('Resumen de estado inválido');
            }
        }
        return filas;
    }

}
