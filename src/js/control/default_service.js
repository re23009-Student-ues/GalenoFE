import DefaultError from "../entity/default_error.js";
import DefaultResponse from "../entity/default_response.js";

class DefaultService {
    constructor() {
        this.BASE_URL = `http://${location.hostname}:9080/GalenoSV-1.0-SNAPSHOT/resources/v1/`;
        this.URL = this.BASE_URL;
    }

    /**
     * Busca un conjunto de registros en el repositorio, usando paginacion.
     * @param {number} first el primer registro a obtener
     * @param {number} max la cantidad maxima de registros a obtener
     * @returns {Promise.<DefaultResponse, DefaultError>} una promesa que se resuelve con un DefaultResponse o se rechaza con un DefaultError
     */
    findRange(first, max) {
        let errorSalida = new DefaultError();
        let salida = new Promise((resolve, reject) => {
            fetch(`${this.URL}?first=${first}&max=${max}`, { method: "GET" }).then(r => {
                if (r.status === 200) {
                    r.json().then(j => {
                        let resp = new DefaultResponse();
                        resp.datos = j;
                        resp.totalDatos = r.headers.get("Total-registros");
                        resolve(resp);
                    }).catch(e => {
                        errorSalida.mensaje = "Error al procesar los datos de respuesta";
                        errorSalida.error = e;
                        reject(errorSalida);
                    });
                } else {
                    errorSalida.mensaje = `Error al obtener los datos: ${r.status}`;
                    errorSalida.error = null; 
                    reject(errorSalida);
                }
            }).catch(e => {
                errorSalida.mensaje = navigator.onLine === false
                    ? "Sin conexión y sin datos guardados para esta pantalla"
                    : "Error al acceder al repositorio";
                errorSalida.error = e;
                reject(errorSalida);
            });
        });
        return salida;
    }


    /**
     * Recorre findRange hasta traer todos los registros.
     * @param {number} [tope=1000] límite explícito; rechaza resultados parciales
     * @returns {Promise.<Array>} una promesa que se resuelve con todos los registros
     */
    async findAll(tope = Infinity) {
        const PAGINA = 50;
        const todos = [];
        const paginas = new Set();
        let first = 0;
        while (true) {
            const resp = await this.findRange(first, PAGINA);
            if (!Array.isArray(resp.datos)) throw new Error('El repositorio no devolvió una lista');
            const firma = JSON.stringify(resp.datos);
            if (resp.datos.length && paginas.has(firma)) throw new Error('El repositorio repitió una página');
            paginas.add(firma);
            todos.push(...resp.datos);
            first += resp.datos.length;
            const raw = resp.totalDatos;
            const total = raw != null && String(raw).trim() !== '' && Number.isSafeInteger(Number(raw)) && Number(raw) >= 0 ? Number(raw) : null;
            if (total !== null && first >= total) return todos;
            if (total === null && resp.datos.length < PAGINA) return todos;
            if (!resp.datos.length) throw new Error('El repositorio devolvió una lista incompleta');
            if (todos.length >= tope) throw new Error('La búsqueda supera el límite solicitado; no se mostrarán resultados parciales');
        }
    }

}

export default DefaultService;
