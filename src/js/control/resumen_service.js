import ConsultaService from "./consulta_service.js";
import { parseFecha } from "./fechas.js";

// ---------- Consultas ----------

/**
 * Consultas que puede ver el usuario: las de su clínica y,
 * si es paciente, solo las suyas.
 */
async function consultasVisibles(usuario) {
    const idClinica = usuario?.idClinica?.idClinica ?? null;
    const esPaciente = usuario?.idRol?.nombre?.toLowerCase() === "paciente";

    // Se descartan duplicados por si el paginado repite registros
    const porId = new Map();
    (await new ConsultaService().findAll()).forEach(c => porId.set(c.idConsulta, c));

    return [...porId.values()]
        .filter(c => !idClinica || c.idPersonaRol?.idClinica?.idClinica === idClinica)
        .filter(c => !esPaciente || c.idPersonaRol?.idPersonaRol === usuario.idPersonaRol)
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

/**
 * Calcula los datos del dashboard con las consultas reales.
 * @param {Object|null} usuario persona_rol de la sesión
 */
export async function cargarResumen(usuario) {
    const ahora = new Date();

    const consultas = (await consultasVisibles(usuario))
        .map(c => ({ ...c, _inicio: parseFecha(c.fechaInicio) }))
        .filter(c => !isNaN(c._inicio));

    const delAnio = consultas.filter(c => c._inicio.getFullYear() === ahora.getFullYear());
    const delMes = delAnio.filter(c => c._inicio.getMonth() === ahora.getMonth());
    const deHoy = delMes.filter(c => c._inicio.getDate() === ahora.getDate());

    const porMes = Array(12).fill(0);
    delAnio.forEach(c => porMes[c._inicio.getMonth()]++);

    // Mañana: antes de 12:00 · Tarde: 12:00 a 17:59 · Noche: desde 18:00
    const porHorario = { manana: 0, tarde: 0, noche: 0 };
    delAnio.forEach(c => {
        const h = c._inicio.getHours();
        if (h < 12) porHorario.manana++;
        else if (h < 18) porHorario.tarde++;
        else porHorario.noche++;
    });

    const pasadas = consultas.filter(c => c._inicio <= ahora);
    const pacientes = new Set(
        pasadas.map(c => c.idPersonaRol?.idPersona?.idPersona).filter(Boolean)
    );

    const aFila = c => ({
        paciente: `${c.idPersonaRol?.idPersona?.nombres ?? ""} ${c.idPersonaRol?.idPersona?.apellidos ?? ""}`.trim() || "Sin nombre",
        inicio: c._inicio,
        observaciones: c.observaciones ?? ""
    });

    return {
        anio: ahora.getFullYear(),
        clinica: usuario?.idClinica?.nombre ?? "Todas las clínicas",
        consultasAnio: delAnio.length,
        consultasMes: delMes.length,
        consultasHoy: deHoy.length,
        pacientesAtendidos: pacientes.size,
        porMes,
        porHorario,
        proximas: consultas
            .filter(c => c._inicio > ahora)
            .sort((a, b) => a._inicio - b._inicio)
            .slice(0, 5)
            .map(aFila),
        recientes: pasadas
            .sort((a, b) => b._inicio - a._inicio)
            .slice(0, 5)
            .map(aFila)
    };
}