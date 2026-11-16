import { filterRows, sortRows } from './data_table_model.js';

// Recorrido iterativo: valida también ciclos y referencias compartidas sin límite de pila.
export function indexTree(data, rowKey, childrenKey) {
    if (!Array.isArray(data)) throw new TypeError('TreeTable: data debe ser un arreglo.');
    const nodes = new Map(), roots = [], seen = new WeakSet();
    const stack = [{ rows: data, parent: null, level: 1, target: roots }];
    while (stack.length) {
        const { rows, parent, level, target } = stack.pop();
        const pending = [];
        for (const row of rows) {
            if (!row || typeof row !== 'object' || Array.isArray(row) || seen.has(row)) throw new TypeError('TreeTable: nodo inválido, cíclico o compartido.');
            seen.add(row);
            const id = row[rowKey];
            if (!((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isFinite(id))) || nodes.has(id)) throw new TypeError('TreeTable: identificadores únicos obligatorios.');
            const children = row[childrenKey] ?? [];
            if (!Array.isArray(children)) throw new TypeError('TreeTable: los hijos deben ser un arreglo.');
            const node = { id, row: { ...row }, parent, level, children: [] };
            nodes.set(id, node); target.push(node);
            pending.push({ rows: children, parent: node, level: level + 1, target: node.children });
        }
        stack.push(...pending.reverse());
    }
    return { nodes, roots };
}

export function treeView(roots, nodes, columns, query, expanded, sort) {
    const searching = !!query.trim(), included = new Set();
    if (searching) {
        const matches = new Set(filterRows([...nodes.values()].map(node => node.row), columns, query));
        for (const node of nodes.values()) {
            if (!matches.has(node.row)) continue;
            let ancestor = node;
            while (ancestor && !included.has(ancestor.id)) { included.add(ancestor.id); ancestor = ancestor.parent; }
        }
    }
    const column = columns.find(item => item.key === sort?.key);
    const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
    const ordered = siblings => {
        if (!column || !sort?.direction) return [...siblings];
        const byRow = new Map(siblings.map(node => [node.row, node]));
        return sortRows(siblings.map(node => node.row), column, sort?.direction, collator).map(row => byRow.get(row));
    };
    const result = [], stack = ordered(roots).reverse();
    while (stack.length) {
        const node = stack.pop();
        if (searching && !included.has(node.id)) continue;
        result.push(node);
        if (searching || expanded.has(node.id)) stack.push(...ordered(node.children).reverse());
    }
    return result;
}
