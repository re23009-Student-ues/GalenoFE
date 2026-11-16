import DefaultService from "./default_service.js";
class ConsultaService extends DefaultService {
    constructor({ clinica, inscripcion } = {}){
        super();
        this.URL+="consulta";
        const filtros = new URLSearchParams();
        if (clinica) filtros.set('clinica', clinica);
        if (inscripcion) filtros.set('inscripcion', inscripcion);
        if (filtros.size) this.URL += `?${filtros}`;
    }
}
export default  ConsultaService;
