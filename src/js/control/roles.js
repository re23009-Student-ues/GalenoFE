/** El login simulado identifica el rol por el nombre entregado en persona_rol. */
export function esPaciente(usuario) {
    return usuario?.idRol?.nombre?.trim().toLocaleLowerCase('es') === 'paciente';
}
