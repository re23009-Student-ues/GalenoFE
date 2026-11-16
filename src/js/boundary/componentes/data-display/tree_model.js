import { indexTree } from './tree_table_model.js';

// Comparte únicamente la validación sin DOM; no depende del componente TreeTable.
export function copyTree(data, rowKey, childrenKey) {
    const { roots } = indexTree(data, rowKey, childrenKey);
    const result = [], stack = [{ nodes: roots, target: result }];
    while (stack.length) {
        const { nodes, target } = stack.pop();
        for (const node of nodes) {
            const children = [], row = { ...node.row, [childrenKey]: children };
            target.push(row); stack.push({ nodes: node.children, target: children });
        }
    }
    return result;
}
export function createTree(data, options) {
    const tree = indexTree(copyTree(data, options.rowKey, options.childrenKey), options.rowKey, options.childrenKey);
    for (const node of tree.nodes.values()) node.disabled = !!node.row[options.disabledKey] || !!node.parent?.disabled;
    return tree;
}
export function visibleTree(roots, nodes, expanded, query, keys) {
    const text = query.trim().toLocaleLowerCase('es'), included = new Set();
    if (text) for (const node of nodes.values()) {
        if (!keys.some(key => String(node.row[key] ?? '').toLocaleLowerCase('es').includes(text))) continue;
        let parent = node;
        while (parent && !included.has(parent.id)) { included.add(parent.id); parent = parent.parent; }
    }
    const result = [], stack = [...roots].reverse();
    while (stack.length) {
        const node = stack.pop();
        if (text && !included.has(node.id)) continue;
        result.push(node);
        if (text || expanded.has(node.id)) for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
    }
    return result;
}
// Las ramas deshabilitadas son límites de propagación y agregación.
export function aggregateSelection(roots, selected, disabled) {
    const states = new Map(), stack = roots.map(node => [node, false]);
    while (stack.length) {
        const [node, visited] = stack.pop();
        if (!visited) { stack.push([node, true]); for (const child of node.children) stack.push([child, false]); continue; }
        const children = node.children.filter(child => !disabled(child)).map(child => states.get(child.id));
        if (children.length && !disabled(node)) {
            const all = children.every(state => state === 'true'), any = children.some(state => state !== 'false');
            if (all) selected.add(node.id); else selected.delete(node.id);
            states.set(node.id, all ? 'true' : any ? 'mixed' : 'false');
        } else states.set(node.id, selected.has(node.id) ? 'true' : 'false');
    }
    return states;
}
