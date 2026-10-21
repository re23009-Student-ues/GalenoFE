import DefaultError from "../entity/default_error.js";
import DefaultResponse from "../entity/default_response.js";

class DefaultService {
    constructor() {
        this.BASE_URL = "http://localhost:9080/GalenoSV-1.0-SNAPSHOT/resources/v1/"; 
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
                errorSalida.mensaje = "Error al acceder al repositorio";
                errorSalida.error = e;
                reject(errorSalida);
            });
        });
        return salida;
    }
}

export default DefaultService;