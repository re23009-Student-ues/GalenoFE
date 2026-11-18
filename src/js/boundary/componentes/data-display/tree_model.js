function indexTree(data) {
    if (!Array.isArray(data)) throw new TypeError('Tree: data debe ser un arreglo.');
    const nodes = new Map(), roots = [], seen = new WeakSet();
    const stack = [{ rows: data, parent: null, level: 1, target: roots }];
    while (stack.length) {
        const { rows, parent, level, target } = stack.pop();
        const pending = [];
        for (const row of rows) {
            if (!row || typeof row !== 'object' || Array.isArray(row) || seen.has(row)) throw new TypeError('Tree: nodo inválido, cíclico o compartido.');
            seen.add(row);
            const id = row.id;
            if (!((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isFinite(id))) || nodes.has(id)) throw new TypeError('Tree: identificadores únicos obligatorios.');
            const children = row.children ?? [];
            if (!Array.isArray(children)) throw new TypeError('Tree: los hijos deben ser un arreglo.');
            const node = { id, row: { ...row }, parent, level, children: [] };
            nodes.set(id, node); target.push(node);
            pending.push({ rows: children, parent: node, level: level + 1, target: node.children });
        }
        stack.push(...pending.reverse());
    }
    return { nodes, roots };
}

export function createTree(data) {
    const tree = indexTree(data);
    for (const node of tree.nodes.values()) {
        node.row.children = node.children.map(child => child.row);
        node.disabled = !!node.row.disabled || !!node.parent?.disabled;
    }
    return tree;
}
export function visibleTree(roots, expanded) {
    const result = [], stack = [...roots].reverse();
    while (stack.length) {
        const node = stack.pop();
        result.push(node);
        if (expanded.has(node.id)) for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
    }
    return result;
}
