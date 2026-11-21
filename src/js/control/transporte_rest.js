/** Transporte REST sin caché persistente. No autentica ni cambia el ingreso simulado. */
export const TIEMPO_LECTURA_REST = 10000;
export const TIEMPO_ESCRITURA_REST = 30000;
const POLITICA = 'sin-cache-rest-v1';
const lecturas = new Map();
const workers = new WeakMap();
let revision = 0;
let servidorNoDisponible = false;

export function sinConexionAlServidor() {
    return servidorNoDisponible;
}

function actualizarConexionREST(noDisponible) {
    if (servidorNoDisponible === noDisponible) return;
    servidorNoDisponible = noDisponible;
    window.dispatchEvent(new Event('galeno-conexion-rest'));
}
const contexto = () => `${sessionStorage.getItem('sesionPersona') ?? ''}|${sessionStorage.getItem('sesionPersonaRol') ?? ''}`;
const fallo = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });

export function invalidarContextoREST() {
    revision++;
    for (const [controller, rechazar] of lecturas) {
        rechazar(fallo('CONTEXTO_CAMBIO', 'El contexto cambió. Vuelve a consultar la pantalla.'));
        controller.abort();
    }
    lecturas.clear();
}

/** Limpia solo respuestas REST históricas, nunca estáticos ni cachés de otras aplicaciones. */
export async function limpiarCachesAPI() {
    try {
        const storage = globalThis.caches;
        if (!storage) return;
        const borrar = storage.delete.bind(storage);
        const conocida = borrar('galeno-api-v1').catch(() => false);
        const nombres = await storage.keys();
        await Promise.all([conocida, ...nombres.filter(n => n.startsWith('galeno-api-') && n !== 'galeno-api-v1').map(borrar)]);
    } catch { /* La política actual no abre ni consulta estas cachés. */ }
}

async function verificarWorker() {
    const worker = navigator.serviceWorker?.controller;
    if (!worker) return;
    if (!workers.has(worker)) {
        workers.set(worker, new Promise((resolve, reject) => {
            const canal = new MessageChannel();
            const terminar = error => {
                clearTimeout(timer); canal.port1.close(); canal.port2.close();
                if (error) reject(error); else resolve();
            };
            const timer = setTimeout(() => terminar(fallo('WORKER_ANTIGUO', 'Actualiza la aplicación con conexión antes de consultar datos.')), 1500);
            canal.port1.onmessage = event => terminar(event.data?.politica === POLITICA ? null : fallo('WORKER_ANTIGUO', 'Actualiza la aplicación con conexión antes de consultar datos.'));
            try { worker.postMessage({ tipo: 'galeno-politica-rest' }, [canal.port2]); }
            catch { terminar(fallo('WORKER_ANTIGUO', 'No se pudo verificar la política de datos. Recarga con conexión.')); }
        }));
    }
    try { await workers.get(worker); }
    catch (error) { workers.delete(worker); throw error; }
    if (worker !== navigator.serviceWorker?.controller) return verificarWorker();
}

export function mensajeTransporte(error, mensajeRed) {
    if (error?.codigo) return error.message;
    return navigator.onLine === false ? 'Sin conexión. Se requiere red para consultar datos actualizados.' : mensajeRed;
}

export async function solicitarREST(url, opciones = {}) {
    const version = revision, identidad = contexto();
    const comprobar = () => {
        if (version !== revision || identidad !== contexto()) throw fallo('CONTEXTO_CAMBIO', 'El contexto cambió. Vuelve a consultar la pantalla.');
    };
    if (navigator.serviceWorker?.controller) await verificarWorker();
    comprobar();
    const lectura = (opciones.method ?? 'GET').toUpperCase() === 'GET';
    const controller = lectura ? new AbortController() : null;
    let timer, rechazar, cancelacion;
    const limite = new Promise((resolve, reject) => { rechazar = reject; });
    const limpiar = () => {
        clearTimeout(timer);
        if (controller) lecturas.delete(controller);
        if (cancelacion) opciones.signal.removeEventListener('abort', cancelacion);
    };
    timer = setTimeout(() => {
        rechazar(lectura
            ? fallo('TIEMPO_AGOTADO', 'La lectura tardó demasiado. Reintenta para obtener datos actualizados.')
            : fallo('ESCRITURA_PENDIENTE', 'No llegó la confirmación completa del guardado. Reintenta con el mismo borrador o recarga para revisar el registro.'));
        controller?.abort(); limpiar();
    }, lectura ? TIEMPO_LECTURA_REST : TIEMPO_ESCRITURA_REST);
    if (lectura) {
        lecturas.set(controller, rechazar);
        if (opciones.signal) {
            cancelacion = () => controller.abort(opciones.signal.reason);
            if (opciones.signal.aborted) cancelacion(); else opciones.signal.addEventListener('abort', cancelacion, { once: true });
        }
    }
    let respuesta;
    try {
        const pendiente = fetch(url, { method: 'GET', ...opciones, cache: 'no-store', ...(controller ? { signal: controller.signal } : {}) });
        respuesta = await Promise.race([pendiente, limite]);
        if (lectura) comprobar();
        actualizarConexionREST([502, 503, 504].includes(respuesta.status));
    } catch (error) {
        limpiar();
        comprobar();
        if (!opciones.signal?.aborted && (error instanceof TypeError || error?.codigo === 'TIEMPO_AGOTADO')) {
            actualizarConexionREST(true);
        }
        throw error;
    }
    // Una escritura no se aborta por plazo o cambio de contexto: puede estar ya confirmada.
    // Su cuerpo tampoco debe aplicarse a otro contexto. Los consumidores conservan status/Location.
    const proteger = response => {
        for (const metodo of ['json', 'text', 'blob', 'arrayBuffer', 'formData']) {
            if (typeof response[metodo] !== 'function') continue;
            const consumir = response[metodo].bind(response);
            response[metodo] = async () => {
                try {
                    comprobar();
                    const datos = await Promise.race([consumir(), limite]);
                    comprobar(); return datos;
                } catch (error) { comprobar(); throw error; }
                finally { limpiar(); }
            };
        }
        if (typeof response.clone === 'function') {
            const clonar = response.clone.bind(response);
            response.clone = () => proteger(clonar());
        }
        return response;
    };
    if (!respuesta.ok || !lectura && (respuesta.status === 201 || respuesta.status === 204 || respuesta.headers.get('Location'))) limpiar();
    return proteger(respuesta);
}
