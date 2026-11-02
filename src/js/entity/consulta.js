import PersonaRol from './persona_rol.js';

class Consulta {
    constructor() {
        this.idConsulta = null;
        this.fechaInicio = null;   // texto del REST, p. ej. "2026-10-29T15:00:00-06:00[America/El_Salvador]"
        this.fechaFin = null;
        this.observaciones = "";
        this.idPersonaRol = new PersonaRol();
    }
}
export default Consulta;