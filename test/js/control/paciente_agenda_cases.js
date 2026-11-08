import ConsultaProcedimientoPasoService from '../../../src/js/control/consultaProcedimientoPaso_service.js';
import { citasParaCalendario } from '../../../src/js/control/paciente_agenda.js';
import { esMedico } from '../../../src/js/control/roles.js';

export async function checkAgenda(assert) {
    let count = 0;
    const check = (condition, message) => { assert(condition, message); count++; };
    const consulta = {idConsulta:'propia',fechaInicio:'2026-11-12T08:00:00-06:00[America/El_Salvador]'};
    const paso = {
        idConsultaProcedimientoPaso:'p1',estado:'PENDIENTE',fechaInicio:'2026-11-13T14:30:00-06:00[America/El_Salvador]',
        idConsultaProcedimiento:{idConsulta:consulta,idProcedimiento:{nombre:'Control médico'}},
        idProcedimientoPaso:{nombre:'Revisión'},
        idPersonaRol:{idPersona:{nombres:'Ana',apellidos:'López'},idRol:{nombre:'Doctor'}}
    };
    const [evento] = citasParaCalendario([consulta],[paso]);
    check(evento.date==='2026-11-13' && evento.time==='14:30','Fecha/hora del paso sin convertir zona');
    check(evento.paso==='Revisión' && evento.procedimiento==='Control médico','Relaciones reales del paso');
    check(evento.esMedico && evento.responsable==='Ana López','Responsable con rol médico confirmado');
    check(evento.status==='pending' && evento.estado==='Pendiente','Estado real, no inferido por fecha');
    for(const rol of ['Doctor','Doctora',' Médico ','MÉDICA']) check(esMedico({idRol:{nombre:rol}}),'Roles médicos explícitos');
    for(const rol of ['Enfermera','Atencion al publico','Asistente de Doctor','Paciente','']) check(!esMedico({idRol:{nombre:rol}}),'Sin inferencia de rol médico');
    const [noMedico]=citasParaCalendario([consulta],[{...paso,idPersonaRol:{...paso.idPersonaRol,idRol:{nombre:'Enfermera'}}}]);
    check(!noMedico.esMedico && noMedico.rolResponsable==='Enfermera','No confundir responsable con médico');
    const [sinRol]=citasParaCalendario([consulta],[{...paso,idPersonaRol:{idPersona:{nombres:'Ana'}}}]);
    check(!sinRol.esMedico,'Nombre de persona no demuestra rol');
    check(citasParaCalendario([consulta],[paso,{...paso,idConsultaProcedimientoPaso:'ajeno',idConsultaProcedimiento:{idConsulta:{idConsulta:'otra'}}}]).length===1,'Excluir pasos ajenos');
    check(citasParaCalendario([consulta],[paso,paso]).length===1,'Duplicados no generan tarjetas duplicadas');
    check(citasParaCalendario([consulta],[paso,{...paso,idConsultaProcedimientoPaso:'p2'}]).length===2,'Varios pasos de una consulta');
    check(citasParaCalendario([consulta],[])[0].paso==='Sin pasos registrados','Consulta sin pasos sigue visible');
    check(!citasParaCalendario([consulta],[])[0].esMedico,'No inventar médico sin pasos');
    check(citasParaCalendario([consulta],[{...paso,fechaInicio:null}])[0].time==='08:00','Fallback a fecha de consulta');
    const service=new ConsultaProcedimientoPasoService();
    let calls=[];
    service.findRange=async(first,max)=>{
        calls.push([first,max]);
        return first===0 ? {datos:[paso,{...paso,idConsultaProcedimientoPaso:'externo',idConsultaProcedimiento:{idConsulta:{idConsulta:'externa'}}}],totalDatos:'3'} :
            {datos:[{...paso,idConsultaProcedimientoPaso:'p2'}],totalDatos:'3'};
    };
    check((await service.listarParaConsultas(['propia'])).length===2,'Paginación y cruce por consulta');
    check(calls.length===2 && calls[1][0]===2 && calls.every(call=>call[1]===50),'Continúa aunque una página sea corta si el total exige más');
    calls=[];check((await service.listarParaConsultas([])).length===0 && calls.length===0,'Sin consultas no hace HTTP');
    let pages=0;
    service.findRange=async first=>{
        pages++;
        return {datos:Array.from({length:Math.min(50,1001-first)},(_,i)=>({...paso,idConsultaProcedimientoPaso:String(first+i)})),totalDatos:'1001'};
    };
    check((await service.listarParaConsultas(['propia'])).length===1001 && pages===21,'Sin truncamiento silencioso a mil pasos');
    service.findRange=async()=>({datos:[paso],totalDatos:'3'});
    let error=false;try {await service.listarParaConsultas(['propia']);} catch {error=true;}
    check(error,'Detecta páginas repetidas');
    service.findRange=async()=>({datos:[paso],totalDatos:null});
    check((await service.listarParaConsultas(['propia'])).length===1,'Finaliza página corta sin cabecera total');
    service.findRange=async()=>({datos:{},totalDatos:'1'});
    error=false;try {await service.listarParaConsultas(['propia']);} catch {error=true;}
    check(error,'Respuesta inválida produce error explícito');
    return count;
}
