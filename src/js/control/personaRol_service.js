
import DefaultService from "./default_service.js";

class PersonaRolService extends DefaultService {
    constructor() {
        super();
        this.URL += "persona_rol";
    }
}

export default PersonaRolService;
