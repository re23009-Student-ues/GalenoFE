/** Operaciones locales sin DOM: no alteran los registros ni el orden recibido. */
export function copyRows(data, { selectable, rowKey }) {
    if (!Array.isArray(data) || Array.from(data).some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
        throw new TypeError('DataTable: data debe ser un arreglo de registros.');
    }
    const keys = new Set();
    return data.map(row => {
        if (selectable) {
            const key = row[rowKey];
            if (!((typeof key === 'string' && key.trim()) || (typeof key === 'number' && Number.isFinite(key))) || keys.has(key)) {
                throw new TypeError(`DataTable: ${rowKey} debe contener claves únicas de texto no vacío o números finitos.`);
            }
            keys.add(key);
        }
        return { ...row };
    });
}

function comparable(value, type) {
    if (value === null || value === undefined || value === '') return null;
    if (type === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;
        return value;
    }
    if (type === 'date') {
        // Fechas explícitas: Date válido, timestamp numérico o cadena ISO.
        if (!(value instanceof Date) && typeof value !== 'number' &&
            !(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value))) return null;
        const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
        return Number.isFinite(time) ? time : null;
    }
    return String(value);
}

export function filterRows(data, columns, query) {
    const text = query.trim().toLocaleLowerCase('es');
    if (!text) return [...data];
    return data.filter(row => columns.some(column => column.searchable !== false &&
        String(row[column.key] ?? '').toLocaleLowerCase('es').includes(text)));
}

export function sortRows(data, column, direction, collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })) {
    if (!column || !direction) return [...data];
    return [...data].sort((a, b) => {
        const av = comparable(a[column.key], column.type || (typeof a[column.key] === 'number' ? 'number' : 'string'));
        const bv = comparable(b[column.key], column.type || (typeof b[column.key] === 'number' ? 'number' : 'string'));
        // Vacíos o valores incompatibles con el tipo al final en ambas direcciones.
        if (av === null) return bv === null ? 0 : 1;
        if (bv === null) return -1;
        const result = typeof av === 'number' && typeof bv === 'number' ? (av < bv ? -1 : av > bv ? 1 : 0) : collator.compare(String(av), String(bv));
        return direction === 'asc' ? result : -result;
    });
}

export function paginateRows(rows, page, pageSize, enabled) {
    const pages = enabled ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;
    const current = enabled ? Math.min(Math.max(1, page), pages) : 1;
    const start = enabled ? (current - 1) * pageSize : 0;
    return { page: current, pages, start, total: rows.length, rows: enabled ? rows.slice(start, start + pageSize) : [...rows] };
}
