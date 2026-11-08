/** El login simulado identifica el rol por el nombre entregado en persona_rol. */
export function esPaciente(usuario) {
    return usuario?.idRol?.nombre?.trim().toLocaleLowerCase('es') === 'paciente';
}

/** Solo nombres de roles médicos explícitos; no se infiere por el nombre de la persona ni del paso. */
export function esMedico(usuario) {
    const nombre = usuario?.idRol?.nombre;
    if (typeof nombre !== 'string') return false;
    const rol = nombre.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    return ['doctor', 'doctora', 'medico', 'medica'].includes(rol);
}
