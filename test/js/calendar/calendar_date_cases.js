import { parseCalendarDate, calendarDateForIntl, addDays, addMonths, monthDays, daysInMonth, weekday, copyEvents } from '../../../src/js/boundary/componentes/calendar/calendar_dates.js';

export function checkDates(assert) {
    let count = 0;
    const check = (value, message) => { assert(value, message); count++; };
    const rejects = action => { try { action(); return false; } catch (error) { return error instanceof TypeError; } };
    check(daysInMonth(2024, 2) === 29, 'Bisiesto');
    check(daysInMonth(1900, 2) === 28 && daysInMonth(2000, 2) === 29, 'Regla de siglos');
    check(monthDays(2021, 2, 1).length === 28, 'Cuatro semanas');
    check(monthDays(2026, 11, 1).length === 42, 'Seis semanas');
    check(monthDays(2026, 4, 1).length === 35, 'Cinco semanas');
    check(monthDays(2026, 11, 0)[0].key === '2026-11-01', 'Inicio domingo');
    check(monthDays(2026, 11, 1)[0].key === '2026-10-26', 'Inicio lunes');
    check(monthDays(2026, 11, 1, false).filter(Boolean).length === 30, 'Días exteriores ocultos');
    check(addDays('2024-02-28', 1) === '2024-02-29', 'Día bisiesto');
    check(addDays('2026-12-31', 1) === '2027-01-01', 'Cambio de año');
    check(addDays('2026-01-01', -1) === '2025-12-31', 'Año anterior');
    check(addMonths('2024-01-31', 1) === '2024-02-29', 'Ajuste a fin de mes');
    check(addMonths('2026-12-12', 1) === '2027-01-12', 'Avance de año');
    check(addDays('0001-01-01', -1) === null && addDays('9999-12-31', 1) === null, 'Límites de años');
    check(addMonths('0001-01-01', -1) === null && addMonths('9999-12-01', 1) === null, 'Límites de meses');
    check(weekday('2026-11-12') === 4, 'Día semanal');
    check(parseCalendarDate('2026-11-12').key === '2026-11-12', 'Sin desplazamiento por zona horaria');
    check(calendarDateForIntl('2026-11-12').getUTCDate() === 12, 'Fecha de Intl estable');
    check(parseCalendarDate(new Date(2026, 10, 12, 0, 1)).key === '2026-11-12', 'Date utiliza campos locales');
    for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '26-01-01', '2026-1-1', '0000-01-01', '2026-11-12T09:00', '', null, new Date(NaN)]) {
        check(rejects(() => parseCalendarDate(value)), 'Rechaza fecha inválida');
    }
    const original = [{ id: 1, title: 'Consulta', date: '2026-11-12', time: '09:00', status: 'confirmed' }];
    const copy = copyEvents(original);
    check(copy !== original && copy[0] !== original[0] && copy[0].time === '09:00', 'Copia sin conversión horaria');
    check(copyEvents([{id:2,title:'Sin hora',date:'2026-11-12'}])[0].time === '', 'Hora opcional');
    for (const invalid of [null, {}, [null], new Array(1), [{...original[0],id:null}], [original[0], original[0]],
        [{...original[0],title:''}], [{...original[0],date:'2026-02-30'}], [{...original[0],time:'24:00'}],
        [{...original[0],time:'9:00'}], [{...original[0],status:''}]]) {
        check(rejects(() => copyEvents(invalid)), 'Rechaza evento inválido');
    }
    return count;
}
