/**
 * Muestra en la barra superior quién tiene la sesión abierta.
 * @param {Object} usuario persona_rol de la sesión
 */
export function pintarUsuario(usuario) {
  const p = usuario.idPersona ?? {};
  document.getElementById("usuario-nombre").textContent =
    `${p.nombres ?? ""} ${p.apellidos ?? ""}`.trim() || "Sin nombre";
  document.getElementById("usuario-detalle").textContent =
    `${usuario.idRol?.nombre ?? ""} · ${usuario.idClinica?.nombre ?? ""}`;
  document.getElementById("usuario-avatar").textContent =
    `${(p.nombres ?? "?")[0]}${(p.apellidos ?? "")[0] ?? ""}`.toUpperCase();
}
