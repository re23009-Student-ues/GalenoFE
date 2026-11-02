import DefaultService from "./default_service.js";
class ConsultaService extends DefaultService {
    constructor(){
        super();
        this.URL+="consulta";
    }
}
export default  ConsultaService;