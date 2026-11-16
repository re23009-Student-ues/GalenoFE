import { assert } from '../lib/chai/index.js';
import sinon from '../lib/sinon/sinon-esm.js';
import ConsultaService from '../../../src/js/control/consulta_service.js';
import TipoDocumentoService from '../../../src/js/control/tipoDocumento_service.js';
import { listarConsultas } from '../../../src/js/control/resumen_service.js';
import { cargarAgenda } from '../../../src/js/control/agenda_service.js';
import '../../../src/js/boundary/login.js';
import '../../../src/js/boundary/vistas/citas_controller.js';

mocha.setup('tdd');
suite('Paso 2: filtros REST y catálogo activo',()=>{
    let sandbox,fetchStub,fixture;
    const response=(rows,total=rows.length)=>new Response(JSON.stringify(rows),{headers:{'Total-registros':String(total)}});
    const pausa=()=>new Promise(r=>setTimeout(r,10));
    async function hasta(fn){for(let i=0;i<100&&!fn();i++)await pausa();assert.isTrue(!!fn());}
    setup(()=>{sandbox=sinon.createSandbox();fetchStub=sandbox.stub(window,'fetch');fixture=document.querySelector('#fixtures');});
    teardown(()=>{fixture.replaceChildren();sandbox.restore();});
    test('sin filtros conserva las URLs existentes',async()=>{
        fetchStub.callsFake(async()=>response([]));await new ConsultaService().findRange(0,50);await new TipoDocumentoService().findRange(0,50);
        assert.isTrue(fetchStub.firstCall.args[0].endsWith('/consulta?first=0&max=50'));
        assert.isTrue(fetchStub.secondCall.args[0].endsWith('/tipo_documento?first=0&max=50'));
    });
    test('123 consultas mantienen clínica e inscripción en todas las páginas',async()=>{
        const rows=Array.from({length:123},(_,i)=>({idConsulta:String(i)}));
        fetchStub.callsFake(async raw=>{
            const url=new URL(raw);assert.equal(url.searchParams.get('clinica'),'clinica /&');assert.equal(url.searchParams.get('inscripcion'),'inscripcion?');
            assert.equal([...url.searchParams.keys()].filter(k=>k==='first').length,1);const first=Number(url.searchParams.get('first'));
            return response(rows.slice(first,first+50),123);
        });
        assert.deepEqual(await new ConsultaService({clinica:'clinica /&',inscripcion:'inscripcion?'}).findAll(),rows);
        assert.deepEqual(fetchStub.getCalls().map(c=>new URL(c.args[0]).searchParams.get('first')),['0','50','100']);
    });
    test('la página vacía conserva el total filtrado del servidor',async()=>{
        fetchStub.resolves(response([],123));const page=await new ConsultaService({clinica:'c'}).findRange(150,50);
        assert.deepEqual(page.datos,[]);assert.equal(page.totalDatos,'123');
    });
    test('123 tipos activos conservan el filtro y el conteo al paginar',async()=>{
        const rows=Array.from({length:123},(_,i)=>({idTipoDocumento:String(i),activo:true}));
        fetchStub.callsFake(async raw=>{const url=new URL(raw);assert.equal(url.searchParams.get('activo'),'true');const first=Number(url.searchParams.get('first'));return response(rows.slice(first,first+50),123);});
        assert.lengthOf(await new TipoDocumentoService({activo:true}).findAll(),123);assert.equal(fetchStub.callCount,3);
    });
    test('el resumen pide clínica e inscripción del contexto paciente',async()=>{
        fetchStub.callsFake(async()=>response([]));
        await listarConsultas({idPersonaRol:'paciente',idRol:{nombre:'Paciente'},idClinica:{idClinica:'clinica'}});
        const url=new URL(fetchStub.firstCall.args[0]);assert.equal(url.searchParams.get('clinica'),'clinica');assert.equal(url.searchParams.get('inscripcion'),'paciente');
    });
    test('resumen laboral filtra por clínica sin convertir el rol en un filtro de inscripción',async()=>{
        fetchStub.callsFake(async()=>response([]));await listarConsultas({idPersonaRol:'empleado',idRol:{nombre:'Doctor'},idClinica:{idClinica:'clinica'}});
        const url=new URL(fetchStub.firstCall.args[0]);assert.equal(url.searchParams.get('clinica'),'clinica');assert.isFalse(url.searchParams.has('inscripcion'));
    });
    test('agenda envía clínica, fechas y rol sin alterar el contexto laboral',async()=>{
        fetchStub.resolves(response([]));await cargarAgenda({idPersonaRol:'empleado',idRol:{idRol:'medico',nombre:'Doctor'},idClinica:{idClinica:'clinica'}},'2026-01-01','2026-01-31');
        const url=new URL(fetchStub.firstCall.args[0]);assert.equal(url.searchParams.get('clinica'),'clinica');assert.equal(url.searchParams.get('rol'),'medico');assert.equal(url.searchParams.get('desde'),'2026-01-01');assert.equal(url.searchParams.get('hasta'),'2026-01-31');
    });
    test('login y citas solicitan catálogo activo sin cambiar el ingreso por documento',async()=>{
        const tipo={idTipoDocumento:'dui',nombre:'DUI',activo:true,expresionRegular:'[0-9]{8}-[0-9]'};
        fetchStub.callsFake(async()=>response([tipo]));
        const login=document.createElement('galeno-login');fixture.append(login);await hasta(()=>!!login.querySelector('option[value="dui"]'));
        const citas=document.createElement('galeno-citas');fixture.append(citas);await hasta(()=>!!citas.querySelector('option[value="dui"]'));
        assert.isAtLeast(fetchStub.callCount,2);
        assert.isTrue(fetchStub.getCalls().every(c=>new URL(c.args[0]).searchParams.get('activo')==='true'));
    });
    test('un error REST no se convierte en cero resultados',async()=>{
        fetchStub.resolves(new Response('',{status:500}));let error;
        try{await new ConsultaService({clinica:'c'}).findAll();}catch(e){error=e;}
        assert.include(error.mensaje,'500');
    });
});
mocha.run();
