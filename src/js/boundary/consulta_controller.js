import TarjetaConsulta from "./componentes/tarjeta_consulta.js";
import ConsultaService from "../control/consulta_service.js";
class ConsultaController extends HTMLElement{
    constructor (){
        super();
        this.registros=[];
        this.ConsultaService=new ConsultaService;
        this.root=this.attachShadow({mode: "open"});
    }
    //ese creo que es un uuid pero no se de que, ese lo cambian, solo es por defectos
    connectedCallback(){
        this.ConsultaService.findByIdClinicaAndIdPersonaAndFechaInicioBetween("038982af-f726-4ced-884e-30747687724c",
            new Date(2026, 0, 1, 0, 0, 0,0),
            new Date(2026, 11, 31, 13, 59, 59, 999),
            0, 10).then(resp => {

                this.registros = resp.datos;
                this.registros.forEach(consulta => {
                    let tarjeta= new TarjetaConsulta();
                    tarjeta.consulta=consulta;
                    this.root.appendChild(tarjeta);
                });
            }).catch(err =>{
                //TODO: mensaje de error
                console.error(err);
            })


    }
}
export default ConsultaController;
customElements.define("consulta-controller",ConsultaController);