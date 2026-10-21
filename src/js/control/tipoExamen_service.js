import DefaultService from "./default_service.js";
class TipoExamenService extends DefaultService {
    constructor() {
        super();
        this.URL += "tipo_examen";
    }
}
export default TipoExamenService;