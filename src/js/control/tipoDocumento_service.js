import DefaultService from "./default_service.js";

class TipoDocumentoService extends DefaultService {
    constructor({ activo } = {}) {
        super();
        this.URL += "tipo_documento";
        if (typeof activo === 'boolean') this.URL += `?activo=${activo}`;
    }
}

export default TipoDocumentoService;
