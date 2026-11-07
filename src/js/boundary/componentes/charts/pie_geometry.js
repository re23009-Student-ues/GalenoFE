/** Copia y valida los datos antes de calcular proporciones. */
export function calculateSlices(data) {
    if (!Array.isArray(data) || Array.from(data).some(item => !item || typeof item.label !== 'string' ||
        !item.label.trim() || typeof item.value !== 'number' || !Number.isFinite(item.value) || item.value < 0)) {
        throw new TypeError('PieChart: data debe ser un arreglo de { label: texto no vacío, value: número finito >= 0 }.');
    }
    // Normalizar por el máximo evita desbordar al sumar números finitos grandes.
    const max = data.reduce((value, item) => Math.max(value, item.value), 0);
    const total = max ? data.reduce((sum, item) => sum + item.value / max, 0) : 0;
    let start = -Math.PI / 2;
    return data.map(({ label, value }) => {
        const fraction = total ? (value / max) / total : 0;
        const end = start + fraction * Math.PI * 2;
        const slice = { label, value, fraction, percentage: fraction * 100, start, end };
        start = end;
        return slice;
    });
}

/** Sector circular. Dos arcos permiten representar correctamente el círculo completo. */
export function sectorPath(cx, cy, radius, start, end, fullCircle = false) {
    if (end <= start || radius <= 0) return '';
    const point = angle => [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    const first = point(start);
    if (fullCircle) {
        const opposite = point(start + Math.PI);
        return `M ${first} A ${radius} ${radius} 0 1 1 ${opposite} A ${radius} ${radius} 0 1 1 ${first} Z`;
    }
    return `M ${cx} ${cy} L ${first} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${point(end)} Z`;
}
