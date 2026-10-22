import PersonaRol from './persona_rol.js';
class Consulta{
    constructor(){
        this.idConsulta = null;
        this.fechaInicio = new Date();
        this.idPersonaRol = new PersonaRol();
    }
}
export default Consulta;