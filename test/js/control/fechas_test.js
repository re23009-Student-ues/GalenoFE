import { assert } from '../lib/chai/index.js';
import { calcularEdad, estadoConsulta, estadoConsultaResponsable, formatoFecha, parseFecha } from '../../../src/js/control/fechas.js';

mocha.setup('tdd');

suite('Fechas y estado de consultas', () => {
    const ahora = new Date('2026-11-17T12:00:00Z');
    const consulta = { idConsulta: 'c1', fechaInicio: '2026-12-01T08:00:00-06:00', fechaFin: '2026-11-16' };
    const contexto = { idPersonaRol: 'contexto-activo' };
    function paso(estado, responsable = contexto, idConsulta = consulta.idConsulta) {
        return { estado, idPersonaRol: responsable, idConsultaProcedimiento: { idConsulta: { idConsulta } } };
    }

    test('Conserva el instante de REST al quitar el sufijo de zona', () => {
        assert.equal(parseFecha('2026-11-17T08:30:00-06:00[America/El_Salvador]').toISOString(), '2026-11-17T14:30:00.000Z');
        assert.isNull(parseFecha(null));
        assert.equal(formatoFecha(null), '');
    });

    test('Finaliza solo cuando hay ejecuciones válidas y todas están completadas', () => {
        assert.equal(estadoConsulta(consulta, ahora, [paso(' completado '), paso('Finalizado'), paso('INVALIDO')]), 'Finalizada');
        assert.equal(estadoConsulta(consulta, ahora, [paso(' INVALIDO ')]), 'Programada');
        assert.equal(estadoConsulta(consulta, ahora, [paso('COMPLETADO'), paso('CANCELADO')]), 'Programada');
        assert.equal(estadoConsulta({ ...consulta, fechaInicio: ahora.toISOString() }, ahora), 'En curso');
    });

    test('Calcula estado personal por asignación de la consulta y detecta una reapertura', () => {
        const registros = [
            paso(' finalizado '),
            paso('PENDIENTE', { idPersonaRol: 'otro-contexto' }),
            paso('PENDIENTE', contexto, 'otra-consulta'),
            paso('INVALIDO')
        ];
        assert.equal(estadoConsultaResponsable(consulta, contexto, registros, ahora), 'Completado');
        registros[0].estado = 'PENDIENTE';
        assert.equal(estadoConsultaResponsable(consulta, contexto, registros, ahora), 'En curso');
        assert.equal(estadoConsultaResponsable(consulta, contexto, registros.slice(1), ahora), 'Programada');
    });

    test('Calcula años cumplidos por día civil y rechaza nacimientos imposibles o futuros', () => {
        const hoy = new Date(2026, 10, 17, 12);
        assert.equal(calcularEdad('2000-11-17T23:59:00-06:00', hoy), 26);
        assert.equal(calcularEdad('2000-11-18', hoy), 25);
        assert.equal(calcularEdad('2000-02-29', hoy), 26);
        for (const fecha of ['2001-02-29', '2027-01-01', '0000-01-01', '17/11/2000', null]) {
            assert.isNull(calcularEdad(fecha, hoy));
        }
    });
});

mocha.run();
