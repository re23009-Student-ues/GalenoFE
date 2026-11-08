import { calculateSlices, sectorPath } from '../../../src/js/boundary/componentes/charts/pie_geometry.js';

export function checkGeometry(assert) {
    let count = 0;
    const check = (value, message) => { assert(value, message); count++; };
    const datasets = [
        [100], [50, 50], [120, 45, 15], [.1, .2, .3], [0, 1, 0],
        [Number.MAX_VALUE, Number.MAX_VALUE], [Number.MIN_VALUE, Number.MIN_VALUE]
    ];
    for (const values of datasets) {
        const slices = calculateSlices(values.map((value, i) => ({ label: `Categoría ${i}`, value })));
        check(Math.abs(slices.reduce((sum, slice) => sum + slice.percentage, 0) - 100) < 1e-10, `Suma 100: ${values}`);
        slices.forEach(slice => {
            const path = sectorPath(160, 160, 140, slice.start, slice.end, slice.fraction === 1);
            check(!/NaN|Infinity/.test(path), 'Geometría finita');
            check(slice.fraction > 0 || path === '', 'Cero sin sector');
        });
    }
    check(calculateSlices([]).length === 0, 'Arreglo vacío');
    check(calculateSlices([{ label: 'Cero', value: 0 }])[0].percentage === 0, 'Total cero');
    const half = calculateSlices([{ label: 'A', value: 1 }, { label: 'B', value: 1 }]);
    check(half.every(slice => slice.percentage === 50), 'Dos mitades');
    check((sectorPath(0, 0, 100, 0, Math.PI * 2, true).match(/ A /g) || []).length === 2, '100 % con dos arcos');
    for (const data of [null, {}, [{label:'',value:1}], [{label:'X',value:-1}], [{label:'X',value:NaN}], [{label:'X',value:Infinity}], [{label:'X',value:'1'}]]) {
        let failed = false;
        try { calculateSlices(data); } catch (error) { failed = error instanceof TypeError; }
        check(failed, 'Datos inválidos rechazados');
    }
    const original = [{ label: 'Original', value: 1 }];
    const copied = calculateSlices(original); original[0].value = 5;
    check(copied[0].value === 1, 'Copia defensiva');
    return count;
}
