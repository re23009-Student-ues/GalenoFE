import ConsultaService from "./consulta_service.js";
import { esPaciente } from "./roles.js";
import { leer } from "./agenda_service.js";
import { parseFecha } from "./fechas.js";

// ---------- Consultas ----------

/**
 * Consultas que puede ver el usuario: las de su clínica y,
 * si es paciente, solo las suyas.
 */
async function consultasVisibles(usuario) {
    const idClinica = usuario?.idClinica?.idClinica ?? null;
    const paciente = esPaciente(usuario);
    if (paciente && (!idClinica || !usuario.idPersonaRol)) return [];

    // Se descartan duplicados por si el paginado repite registros
    const porId = new Map();
    const servicio = new ConsultaService({ clinica: idClinica, inscripcion: paciente ? usuario.idPersonaRol : null });
    (await servicio.findAll()).forEach(c => porId.set(c.idConsulta, c));

    return [...porId.values()]
        .filter(c => !idClinica || c.idPersonaRol?.idClinica?.idClinica === idClinica)
        .filter(c => !paciente || c.idPersonaRol?.idPersonaRol === usuario.idPersonaRol)
        .filter(c => parseFecha(c.fechaInicio));
}

/**
 * Todas las consultas visibles, de la más reciente a la más antigua.
 * @param {Object|null} usuario persona_rol de la sesión
 */
export async function listarConsultas(usuario) {
    return (await consultasVisibles(usuario))
        .sort((a, b) => parseFecha(b.fechaInicio) - parseFecha(a.fechaInicio));
}

/** Dashboard agregado por el servidor; solo adapta las diez fechas de las filas. */
export async function cargarResumen(usuario) {
    const clinica = usuario?.idClinica?.idClinica;
    const paciente = esPaciente(usuario);
    if (paciente && (!clinica || !usuario.idPersonaRol)) throw new Error('Contexto de paciente incompleto');
    const filtros = new URLSearchParams();
    if (clinica) filtros.set('clinica', clinica);
    if (paciente) filtros.set('inscripcion', usuario.idPersonaRol);
    const datos = await (await leer(`consulta/resumen${filtros.size ? '?' + filtros : ''}`)).json();
    const contador = valor => Number.isSafeInteger(valor) && valor >= 0;
    if (!datos || datos.zona !== 'America/El_Salvador' || !Number.isInteger(datos.anio) || datos.anio < 1 ||
            !Number.isFinite(Date.parse(datos.evaluadoEn)) ||
            !['consultasAnio', 'consultasMes', 'consultasHoy', 'pacientesAtendidos'].every(c => contador(datos[c])) ||
            !Array.isArray(datos.porMes) || datos.porMes.length !== 12 || !datos.porMes.every(contador) ||
            !['manana', 'tarde', 'noche'].every(c => contador(datos.porHorario?.[c])) ||
            datos.porMes.reduce((a, b) => a + b, 0) !== datos.consultasAnio ||
            ['manana', 'tarde', 'noche'].reduce((a, c) => a + datos.porHorario[c], 0) !== datos.consultasAnio) {
        throw new Error('El servidor devolvió un resumen inválido');
    }
    const adaptar = filas => {
        if (!Array.isArray(filas) || filas.length > 5) throw new Error('Listado de resumen inválido');
        return filas.map(fila => {
            if (!fila || typeof fila.paciente !== 'string' || typeof fila.observaciones !== 'string' ||
                    typeof fila.inicio !== 'string' || !Number.isFinite(Date.parse(fila.inicio))) throw new Error('Fecha o fila de resumen inválida');
            return { ...fila, inicio: new Date(fila.inicio) };
        });
    };
    return { ...datos, clinica: usuario?.idClinica?.nombre ?? 'Todas las clínicas',
        proximas: adaptar(datos.proximas), recientes: adaptar(datos.recientes) };
}
