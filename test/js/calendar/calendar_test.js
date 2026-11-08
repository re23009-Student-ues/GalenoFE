import { assert } from '../lib/chai/index.js';
import { Calendar } from '../../../src/js/boundary/componentes/calendar/index.js';
import { todayKey } from '../../../src/js/boundary/componentes/calendar/calendar_dates.js';
import { checkDates } from './calendar_date_cases.js';

mocha.setup('tdd');
suite('Calendar', () => {
    let host, calendars;
    const events = [
        {id:1,title:'Consulta general',date:'2026-11-12',time:'09:00',status:'confirmed'},
        {id:2,title:'Seguimiento',date:'2026-11-12',time:'14:30',status:'pending'},
        {id:3,title:'Control',date:'2026-11-18',time:'10:00',status:'cancelled'}
    ];
    setup(() => {
        host = document.createElement('div'); host.style.width = '640px';
        document.querySelector('#fixtures').append(host); calendars = [];
    });
    teardown(() => { calendars.forEach(calendar => calendar.destroy()); document.querySelector('#fixtures').replaceChildren(); });
    const create = (options = {}, container = host) => {
        const calendar = new Calendar(container, {initialDate:'2026-11-01',events,...options});
        calendars.push(calendar); return calendar.render();
    };
    const day = date => host.querySelector(`[data-date="${date}"]`);
    test('Fechas civiles, bisiestos, límites y validación de eventos', () => checkDates(assert.isTrue));
    test('Fecha seleccionada inicial sin callback ni cambio de mes visible', () => {
        let calls = 0;
        const calendar = create({selectedDate:'2026-11-12',onDateClick:()=>calls++});
        assert.equal(calendar.getSelectedDate(),'2026-11-12');
        assert.equal(day('2026-11-12').getAttribute('aria-pressed'),'true');
        assert.include(host.querySelector('.calendar__event-list').textContent,'Consulta general');
        assert.equal(calls,0);
        assert.throws(()=>new Calendar(host,{selectedDate:'2026-02-30'}),TypeError);
    });
    test('Mes vacío sin puntos y selección sin eventos', () => {
        const calendar = create({events:[]});
        assert.lengthOf(host.querySelectorAll('.calendar__dots .calendar__dot'), 0);
        day('2026-11-02').click();
        assert.equal(calendar.getSelectedDate(), '2026-11-02');
        assert.include(host.textContent, 'No hay eventos para esta fecha');
    });
    test('Uno o varios eventos, colores configurables y estados textuales', () => {
        create({statusColors:{confirmed:'#123456'}});
        assert.lengthOf(day('2026-11-18').querySelectorAll('.calendar__dot'), 1);
        assert.lengthOf(day('2026-11-12').querySelectorAll('.calendar__dot'), 2);
        assert.equal(day('2026-11-12').querySelector('.calendar__dot').style.backgroundColor, 'rgb(18, 52, 86)');
        assert.include(day('2026-11-12').getAttribute('aria-label'), '2 eventos');
        day('2026-11-12').click();
        assert.include(host.querySelector('.calendar__event-list').textContent, 'Confirmada');
        assert.include(host.querySelector('.calendar__event-list').textContent, 'Pendiente');
    });
    test('Máximo de puntos y contador con todos los eventos disponibles', () => {
        const calendar = create({events:Array.from({length:5},(_,index)=>({...events[0],id:index})),maxDots:3});
        assert.lengthOf(day('2026-11-12').querySelectorAll('.calendar__dot'), 3);
        assert.equal(day('2026-11-12').querySelector('.calendar__more').textContent, '+2');
        day('2026-11-12').click();
        assert.lengthOf(calendar.getEventsByDate('2026-11-12'), 5);
        assert.lengthOf(host.querySelectorAll('.calendar__event'), 5);
    });
    test('Selección y callback reciben copias y no se duplican al renderizar', () => {
        let calls = 0;
        const calendar = create({onDateClick:(date, received)=>{
            calls++; assert.equal(date, '2026-11-12'); received[0].title='Cambiado';
        }});
        calendar.render().render(); day('2026-11-12').click();
        assert.equal(calls, 1); assert.equal(calendar.getEventsByDate('2026-11-12')[0].title, 'Consulta general');
        assert.equal(day('2026-11-12').getAttribute('aria-pressed'), 'true');
        assert.isTrue(day('2026-11-12').classList.contains('calendar__day--selected'));
    });
    test('Navegación y cambio de año notifican meses 1–12, sin modificar selección', () => {
        const changes = [];
        const calendar = create({onMonthChange:(year,month)=>changes.push([year,month])});
        day('2026-11-12').click();
        host.querySelector('[data-command=next]').click(); calendar.nextMonth();
        assert.deepEqual(changes, [[2026,12],[2027,1]]);
        calendar.previousMonth(); assert.deepEqual(changes[2], [2026,12]);
        assert.equal(calendar.getSelectedDate(), '2026-11-12');
        calendar.goToDate('2026-12-15'); assert.lengthOf(changes, 3);
        calendar.today(); assert.exists(day(todayKey()));
        assert.equal(day(todayKey()).getAttribute('aria-current'), 'date');
    });
    test('Cuatro/cinco/seis semanas, febrero bisiesto y días exteriores', () => {
        const calendar = create({initialDate:'2021-02-01',showOutsideDays:false});
        assert.lengthOf(host.querySelectorAll('tbody tr'), 4);
        calendar.goToDate('2026-04-01'); assert.lengthOf(host.querySelectorAll('tbody tr'), 5);
        calendar.goToDate('2026-11-01'); assert.lengthOf(host.querySelectorAll('tbody tr'), 6);
        assert.notExists(day('2026-10-31'));
        calendar.goToDate('2024-02-01'); assert.exists(day('2024-02-29')); assert.notExists(day('2024-02-30'));
    });
    test('Update/add/remove conservan mes y selección y actualizan lista y marcadores', () => {
        const calendar = create(); day('2026-11-12').click();
        calendar.update([{...events[0],title:'Actualizada'}]);
        assert.equal(calendar.getSelectedDate(), '2026-11-12');
        assert.include(host.querySelector('.calendar__event-list').textContent, 'Actualizada');
        calendar.addEvent({...events[1],id:4});
        assert.lengthOf(day('2026-11-12').querySelectorAll('.calendar__dot'), 2);
        calendar.removeEvent(1); assert.lengthOf(calendar.getEventsByDate('2026-11-12'), 1);
        calendar.removeEvent(4); assert.include(host.textContent, 'No hay eventos para esta fecha');
        assert.exists(day('2026-11-30'));
        assert.equal(events[0].title, 'Consulta general');
    });
    test('Click de evento y orden por hora sin conversiones', () => {
        let received;
        create({events:[events[1],events[0]],onEventClick:event=>{received=event;}});
        day('2026-11-12').click();
        assert.equal(host.querySelector('.calendar__time').textContent, '09:00');
        host.querySelector('.calendar__event').click(); assert.equal(received.id,1); assert.equal(received.time,'09:00');
    });
    test('Lista opcional, selección desactivada y callbacks externos', () => {
        let calls = 0;
        const calendar = create({showEventList:false,onDateClick:()=>calls++});
        day('2026-11-12').click(); assert.equal(calls,1); assert.notExists(host.querySelector('.calendar__event-list'));
        calendar.destroy();
        const readonly = create({selectable:false}); day('2026-11-12').click(); assert.isNull(readonly.getSelectedDate());
    });
    test('Navegación de teclado, foco y Enter nativo', () => {
        const calendar = create(); day('2026-11-30').focus();
        const press = key => document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
        press('ArrowRight'); assert.equal(document.activeElement.dataset.date,'2026-12-01');
        assert.isNull(calendar.getSelectedDate());
        press('Home'); assert.equal(document.activeElement.dataset.date,'2026-11-30');
        press('End'); assert.equal(document.activeElement.dataset.date,'2026-12-06');
        press('PageDown'); assert.equal(document.activeElement.dataset.date,'2027-01-06');
        document.activeElement.click(); assert.equal(calendar.getSelectedDate(),'2027-01-06');
        calendar.update(events); assert.equal(document.activeElement.dataset.date,'2027-01-06');
        assert.lengthOf(host.querySelectorAll('.calendar__day[tabindex="0"]'),1);
    });
    test('Datos inválidos no modifican vista y contenido no se interpreta como HTML', () => {
        const calendar = create();
        assert.throws(()=>calendar.update([{...events[0],date:'2026-02-30'}]),TypeError);
        assert.throws(()=>calendar.addEvent(events[0]),TypeError);
        assert.lengthOf(calendar.getEventsByDate('2026-11-12'),2);
        assert.throws(()=>calendar.goToDate('2026-13-01'),TypeError);
        assert.throws(()=>new Calendar('#missing-calendar'));
        assert.throws(()=>new Calendar(host,{maxDots:-1}),TypeError);
        calendar.update([{...events[0],title:'<img src=x>',status:'<script>texto</script>'}]);
        day('2026-11-12').click(); assert.notExists(host.querySelector('img')); assert.notExists(host.querySelector('script'));
        assert.include(host.querySelector('.calendar__event-list').textContent,'<img src=x>');
    });
    test('Múltiples calendarios, destrucción idempotente y reinicialización', () => {
        const first = create(); const other = document.createElement('div'); document.querySelector('#fixtures').append(other);
        create({},other);
        assert.notEqual(host.querySelector('h3').id,other.querySelector('h3').id);
        const oldButton = day('2026-11-12'); first.destroy(); first.destroy(); oldButton.click();
        assert.notExists(host.querySelector('.calendar')); assert.exists(other.querySelector('.calendar'));
        for (const action of [()=>first.render(),()=>first.update([]),()=>first.addEvent(events[0]),()=>first.removeEvent(1),()=>first.goToDate('2026-11-01'),
            ()=>first.nextMonth(),()=>first.previousMonth(),()=>first.today(),()=>first.getEventsByDate('2026-11-12'),()=>first.getSelectedDate()]) assert.throws(action);
        create(); assert.exists(host.querySelector('.calendar'));
    });
    test('Contenedor móvil mantiene las siete columnas y oculta contador sin espacio', () => {
        host.style.width='280px';
        create({events:Array.from({length:5},(_,index)=>({...events[0],id:index}))});
        assert.lengthOf(host.querySelectorAll('thead th'),7);
        assert.isAtMost(host.querySelector('.calendar').getBoundingClientRect().width,280);
        assert.equal(getComputedStyle(day('2026-11-12').querySelector('.calendar__more')).display,'none');
    });
});
mocha.run(failures => {document.body.dataset.testFailures=failures;});
