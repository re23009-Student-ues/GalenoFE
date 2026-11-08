import { copyRows, filterRows, sortRows, paginateRows } from '../../../src/js/boundary/componentes/data-display/data_table_model.js';

export function checkModel(assert) {
    let count = 0;
    const check = (condition, message) => { assert(condition, message); count++; };
    const rejects = fn => { try { fn(); return false; } catch (error) { return error instanceof TypeError; } };
    const rows = [{ id: 1, name: 'Juan Pérez', age: 35 }, { id: 2, name: 'María López', age: 28 }, { id: 3, name: 'Ana', age: null }];
    const options = { selectable: true, rowKey: 'id' };
    const copy = copyRows(rows, options);
    check(copy !== rows && copy[0] !== rows[0], 'Copia defensiva');
    check(copyRows([{ name: 'Sin ID' }], { selectable: false }).length === 1, 'Clave opcional sin selección');
    for (const invalid of [null, {}, [null], [1], new Array(1), [{ id: 1 }, { id: 1 }], [{ name: 'Sin ID' }], [{id:NaN}], [{id:''}]]) {
        check(rejects(() => copyRows(invalid, options)), 'Validación de filas y claves');
    }
    const columns = [{ key: 'name' }, { key: 'age', searchable: false }];
    check(filterRows(rows, columns, '  JUAN ').length === 1, 'Búsqueda parcial sin mayúsculas');
    check(filterRows(rows, columns, '35').length === 0, 'Exclusión de columnas');
    check(filterRows(rows, columns, 'xyz').length === 0, 'Sin coincidencias');
    check(filterRows(rows, columns, '').length === 3, 'Búsqueda vacía');
    check(sortRows(rows, {key:'age',type:'number'}, 'asc').map(row=>row.id).join() === '2,1,3', 'Orden numérico ascendente');
    check(sortRows(rows, {key:'age',type:'number'}, 'desc').map(row=>row.id).join() === '1,2,3', 'Descendente con nulos al final');
    check(sortRows(rows, {key:'name'}, 'asc')[0].name === 'Ana', 'Orden textual');
    check(sortRows(rows, null, null).map(row=>row.id).join() === '1,2,3', 'Sin ordenamiento');
    check(rows.map(row=>row.id).join() === '1,2,3', 'No muta entrada');
    const dates = [{id:1,date:'2026-11-02'}, {id:2,date:'2025-01-01'}, {id:3,date:null}, {id:4,date:'inválida'}];
    check(sortRows(dates, {key:'date',type:'date'}, 'asc').map(row=>row.id).join() === '2,1,3,4', 'Fechas explícitas');
    const page = paginateRows(rows, 99, 2, true);
    check(page.page === 2 && page.pages === 2 && page.rows[0].id === 3 && page.start === 2, 'Ajusta página fuera de rango');
    check(paginateRows([], 5, 10, true).page === 1, 'Paginación vacía');
    check(paginateRows(rows, 2, 1, false).rows.length === 3, 'Paginación desactivada');
    return count;
}
