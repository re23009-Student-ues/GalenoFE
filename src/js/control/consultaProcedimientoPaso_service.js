import DefaultService from './default_service.js';

/** El recurso actual solo admite paginación; la relación se cruza localmente por idConsulta. */
export default class ConsultaProcedimientoPasoService extends DefaultService {
    constructor() {
        super();
        this.URL += 'consulta_procedimiento_paso';
    }

    async listarParaConsultas(idsConsultas) {
        const permitidas = new Set(idsConsultas);
        if (!permitidas.size) return [];
        const encontrados = new Map();
        const vistos = new Set();
        const size = 50;
        let first = 0;
        while (true) {
            const response = await this.findRange(first, size);
            const rows = response.datos;
            if (!Array.isArray(rows)) throw new TypeError('Los pasos de consultas no tienen un formato válido.');
            const header = response.totalDatos;
            const total = header != null && String(header).trim() !== '' && Number.isSafeInteger(Number(header)) && Number(header) >= 0 ? Number(header) : null;
            let nuevos = 0;
            for (const row of rows) {
                const id = row?.idConsultaProcedimientoPaso;
                if (!((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isFinite(id)))) {
                    throw new TypeError('Un paso de consulta no contiene un identificador válido.');
                }
                if (!vistos.has(id)) { vistos.add(id); nuevos++; }
                const consulta = row.idConsultaProcedimiento?.idConsulta;
                if (permitidas.has(consulta?.idConsulta)) encontrados.set(id, row);
            }
            if (rows.length && !nuevos) throw new Error('La paginación de pasos repitió una página completa.');
            first += rows.length;
            if (total !== null && first >= total) break;
            if (total === null && rows.length < size) break;
            if (!rows.length || !nuevos) throw new Error('No se pudieron completar las páginas de pasos de consultas.');
        }
        return [...encontrados.values()];
    }
}
