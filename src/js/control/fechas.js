export function parseFecha(texto) {
    if (!texto) return null;
    return new Date(texto.replace(/\[.*\]$/, ""));
}

export function formatoFecha(texto) {
    const f = parseFecha(texto);
    return f ? f.toLocaleString("es-SV", { dateStyle: "full", timeStyle: "short" }) : "";
}

/** Finaliza solo con pasos reales no vacíos y todos completados; fechaFin no decide el estado. */
export function estadoConsulta(c, ahora = new Date(), pasos = []) {
    pasos = Array.isArray(pasos) ? pasos.filter(paso => String(paso?.estado ?? '').trim().toUpperCase() !== 'INVALIDO') : [];
    const inicio = parseFecha(c.fechaInicio);
    if (pasos.length && pasos.every(paso =>
        typeof paso?.estado === 'string' && ['COMPLETADO', 'FINALIZADO'].includes(paso.estado.trim().toUpperCase()))) {
        return "Finalizada";
    }
    if (inicio && inicio > ahora) return "Programada";
    return "En curso";
}


/** Estado de trabajo del responsable; se recalcula con las asignaciones actuales. */
export function estadoConsultaResponsable(c, contexto, pasos = [], ahora = new Date()) {
    const asignados = pasos.filter(paso => String(paso?.estado ?? '').trim().toUpperCase() !== 'INVALIDO' && contexto?.idPersonaRol &&
        paso.idPersonaRol?.idPersonaRol === contexto.idPersonaRol &&
        paso.idConsultaProcedimiento?.idConsulta?.idConsulta === c.idConsulta);
    if (!asignados.length) return estadoConsulta(c, ahora, pasos);
    return asignados.every(paso => typeof paso.estado === 'string' &&
        ['COMPLETADO', 'FINALIZADO'].includes(paso.estado.trim().toUpperCase())) ? 'Completado' : 'En curso';
}

/** Años cumplidos a la fecha local actual; conserva el día civil recibido del REST. */
export function calcularEdad(fechaNacimiento, hoy = new Date()) {
    if (typeof fechaNacimiento !== 'string' || !(hoy instanceof Date) || !Number.isFinite(hoy.getTime())) return null;
    const partes = /^(\d{4})-(\d{2})-(\d{2})(?:$|T\d{2}:\d{2})/.exec(fechaNacimiento);
    if (!partes) return null;
    const [, year, month, day] = partes.map(Number);
    const fecha = new Date(0);
    fecha.setUTCFullYear(year, month - 1, day);
    if (year < 1 || fecha.getUTCFullYear() !== year || fecha.getUTCMonth() !== month - 1 || fecha.getUTCDate() !== day) return null;
    let edad = hoy.getFullYear() - year;
    if (hoy.getMonth() + 1 < month || (hoy.getMonth() + 1 === month && hoy.getDate() < day)) edad--;
    return edad >= 0 ? edad : null;
}
