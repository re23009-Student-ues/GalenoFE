import DefaultService from "./default_service.js";

class TipoDocumentoService extends DefaultService {
    constructor() {
        super();
        this.URL += "tipo_documento";
    }
}

export default TipoDocumentoService;
