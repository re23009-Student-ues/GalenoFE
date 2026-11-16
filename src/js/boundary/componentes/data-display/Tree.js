import { copyTree, createTree, visibleTree, aggregateSelection } from './tree_model.js';

const defaults = {
    data: [], rowKey: 'id', labelKey: 'label', iconKey: 'icon', childrenKey: 'children',
    disabledKey: 'disabled', hasChildrenKey: 'hasChildren', selection: 'single',
    propagateSelection: true, searchable: true, searchKeys: null, highlight: true,
    guides: true, theme: 'auto', title: 'Explorador', expanded: [], icons: {}
};
const callbacks = { click: 'onNodeClick', select: 'onNodeSelect', expand: 'onNodeExpand', collapse: 'onNodeCollapse',
    'selection-change': 'onSelectionChange', 'double-click': 'onNodeDoubleClick', error: 'onError' };
function el(tag, className = '', text) {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}
function button(text, command) {
    const control = el('button', 'tree__button', text); control.type = 'button'; control.dataset.command = command; return control;
}
export default class Tree extends HTMLElement {
    constructor() {
        super(); this.options = { ...defaults }; this.nodes = new Map(); this.roots = [];
        this.expanded = new Set(); this.selected = new Set(); this.pending = new Map(); this.loaded = new Set();
        this.errors = new Map(); this.items = new Map(); this.view = []; this.query = ''; this.destroyed = false;
    }
    connectedCallback() { if (!this.destroyed) this.refresh(); }
    disconnectedCallback() { this.listeners?.abort(); this.listeners = null; this.cancelLoads(); }
    assertActive() { if (this.destroyed) throw new Error('Tree: componente destruido.'); }
    configure(options = {}) {
        this.assertActive(); const next = { ...defaults, ...options };
        if (!['none', 'single', 'multiple'].includes(next.selection) || !['auto', 'light', 'dark'].includes(next.theme) ||
            ['rowKey', 'labelKey', 'iconKey', 'childrenKey', 'disabledKey', 'hasChildrenKey', 'title'].some(key => typeof next[key] !== 'string' || !next[key].trim()) ||
            ['propagateSelection', 'searchable', 'highlight', 'guides'].some(key => typeof next[key] !== 'boolean') ||
            !(next.expanded === true || Array.isArray(next.expanded)) ||
            (next.searchKeys !== null && (!Array.isArray(next.searchKeys) || next.searchKeys.some(key => typeof key !== 'string' || !key))) ||
            !next.icons || typeof next.icons !== 'object' || Array.isArray(next.icons) ||
            [...Object.values(callbacks), 'onLoadChildren', 'renderIcon', 'renderLabel'].some(key => next[key] !== undefined && typeof next[key] !== 'function')) throw new TypeError('Tree: configuración inválida.');
        if (new Set([next.rowKey, next.childrenKey, next.labelKey]).size !== 3) throw new TypeError('Tree: campos de ID, hijos y etiqueta deben ser diferentes.');
        const tree = createTree(next.data, next);
        this.cancelLoads(); this.expandRun = null; this.options = { ...next, icons: { ...next.icons }, searchKeys: next.searchKeys ? [...next.searchKeys] : [next.labelKey] };
        Object.assign(this, tree); this.selected.clear(); this.loaded.clear(); this.errors.clear();
        this.expanded = new Set(next.expanded === true ? this.nodes.keys() : next.expanded);
        this.query = ''; this.savedExpansion = null; this.focusId = null; this.message = ''; this.search = null;
        this.listeners?.abort(); this.listeners = null; this.replaceChildren(); this.root = null; this.items.clear();
        this.refresh();
        for (const id of this.expanded) {
            const node = this.nodes.get(id);
            if (node && !this.disabled(node) && this.options.onLoadChildren && node.row[this.options.hasChildrenKey] && !node.children.length) this.loadChildren(id);
        }
        return this;
    }
    disabled(node) { return !!node.disabled; }
    sourceRow(node, data) { return (node.parent ? node.parent.row[this.options.childrenKey] : data).find(row => row[this.options.rowKey] === node.id); }
    branch(node) { return !!node.children.length || (!!this.options.onLoadChildren && !!node.row[this.options.hasChildrenKey] && !this.loaded.has(node.id)); }
    snapshot(node) { return node ? copyTree([node.row], this.options.rowKey, this.options.childrenKey)[0] : null; }
    getData() { this.assertActive(); return copyTree(this.roots.map(node => node.row), this.options.rowKey, this.options.childrenKey); }
    getNode(id) { this.assertActive(); return this.snapshot(this.nodes.get(id)); }
    lazySnapshot(node) {
        if (!node) return null;
        const row = { ...node.row }, { rowKey, childrenKey } = this.options;
        Object.defineProperty(row, childrenKey, { enumerable: true, configurable: true, get() {
            const children = copyTree([node.row], rowKey, childrenKey)[0][childrenKey];
            Object.defineProperty(row, childrenKey, { enumerable: true, configurable: true, writable: true, value: children });
            return children;
        } });
        return row;
    }
    getSelectedNodes() { this.assertActive(); return [...this.selected].map(id => this.lazySnapshot(this.nodes.get(id))); }
    context(node, extra = {}) { return { id: node?.id, node: this.lazySnapshot(node), parentId: node?.parent?.id ?? null, level: node?.level, tree: this, ...extra }; }
    notify(type, node, extra = {}) {
        const detail = this.context(node, extra);
        this.dispatchEvent(new CustomEvent(`tree-${type}`, { detail, bubbles: true, composed: true }));
        try {
            const result = this.options[callbacks[type]]?.(detail);
            Promise.resolve(result).catch(error => { if (!this.destroyed && type !== 'error') this.report(error, node, 'callback'); });
        } catch (error) { if (type !== 'error') this.report(error, node, 'callback'); }
    }
    report(error, node, operation) {
        this.message = error?.message || String(error); this.status && (this.status.textContent = this.message);
        this.notify('error', node, { error, message: this.message, operation });
    }
    cancelLoads(ids = null) {
        for (const [id, request] of this.pending) if (!ids || ids.has(id)) { this.pending.delete(id); request.controller.abort(); }
    }
    commit(tree) {
        const previous = [...this.selected]; Object.assign(this, tree);
        const valid = id => this.nodes.has(id) && !this.disabled(this.nodes.get(id));
        this.selected = new Set(previous.filter(valid)); this.expanded = new Set([...this.expanded].filter(id => this.nodes.has(id)));
        this.loaded = new Set([...this.loaded].filter(id => this.nodes.has(id)));
        if (this.savedExpansion) this.savedExpansion = new Set([...this.savedExpansion].filter(id => this.nodes.has(id)));
        for (const id of this.errors.keys()) if (!this.nodes.has(id)) this.errors.delete(id);
        this.message = ''; this.items.clear(); this.refresh();
        if (previous.length !== this.selected.size || previous.some(id => !this.selected.has(id))) this.selectionChanged();
        return this;
    }
    setData(data) {
        this.assertActive();
        try { const tree = createTree(data, this.options); this.cancelLoads(); this.expandRun = null; this.loaded.clear(); this.errors.clear(); return this.commit(tree); }
        catch (error) { this.report(error, null, 'setData'); return this; }
    }
    edit(operation, change, invalidated = new Set()) {
        this.assertActive();
        try {
            const tree = createTree(this.getData(), this.options), data = tree.roots.map(node => node.row); change(tree, data);
            const next = createTree(data, this.options); this.cancelLoads(invalidated); this.expandRun = null;
            for (const id of invalidated) { this.loaded.delete(id); this.errors.delete(id); }
            return this.commit(next);
        } catch (error) { this.report(error, null, operation); return this; }
    }
    // Mutaciones sobre la copia jerárquica; se valida antes de reemplazar el estado.
    addNode(parentId, row) {
        return this.edit('addNode', (tree, data) => {
            const parent = parentId === null ? null : tree.nodes.get(parentId);
            if (parentId !== null && !parent) throw new Error('Tree: padre inexistente.');
            (parent ? parent.row[this.options.childrenKey] : data).push(row);
        }, new Set([parentId]));
    }
    updateNode(id, changes) {
        return this.edit('updateNode', (tree, data) => {
            const node = tree.nodes.get(id); if (!node) throw new Error('Tree: nodo inexistente.');
            if (!changes || typeof changes !== 'object' || Array.isArray(changes) || (this.options.rowKey in changes && changes[this.options.rowKey] !== id)) throw new TypeError('Tree: cambios inválidos; el ID es inmutable.');
            Object.assign(this.sourceRow(node, data), changes);
        }, this.subtreeIds(id));
    }
    removeNode(id) {
        return this.edit('removeNode', (tree, data) => {
            const node = tree.nodes.get(id); if (!node) throw new Error('Tree: nodo inexistente.');
            const rows = node.parent ? node.parent.row[this.options.childrenKey] : data;
            rows.splice(rows.findIndex(row => row[this.options.rowKey] === id), 1);
            if (this.focusId === id || this.subtreeIds(id).has(this.focusId)) this.focusId = node.parent?.id ?? null;
        }, this.subtreeIds(id));
    }
    subtreeIds(id) {
        const ids = new Set(), stack = this.nodes.has(id) ? [this.nodes.get(id)] : [];
        while (stack.length) { const node = stack.pop(); ids.add(node.id); for (const child of node.children) stack.push(child); }
        return ids;
    }
    selectionChanged(node) { this.notify('selection-change', node, { nodes: this.getSelectedNodes() }); }
    selectionStates() {
        return this.options.selection === 'multiple' && this.options.propagateSelection ? aggregateSelection(this.roots, this.selected, node => this.disabled(node)) : new Map([...this.nodes.keys()].map(id => [id, this.selected.has(id) ? 'true' : 'false']));
    }
    selectNode(id, selected = true) {
        this.assertActive(); const node = this.nodes.get(id);
        if (!node || this.disabled(node) || this.options.selection === 'none') return this;
        if (this.options.selection === 'single') this.selected.clear();
        const stack = [node];
        while (stack.length) {
            const current = stack.pop(); if (this.disabled(current)) continue;
            if (selected) this.selected.add(current.id); else this.selected.delete(current.id);
            if (this.options.selection === 'multiple' && this.options.propagateSelection) for (const child of current.children) stack.push(child);
        }
        this.paintSelection(); this.notify('select', node, { selected: this.selected.has(id) }); this.selectionChanged(node); return this;
    }
    clearSelection() { this.assertActive(); this.selected.clear(); this.paintSelection(); this.selectionChanged(); return this; }
    async expandNode(id) {
        this.assertActive(); const node = this.nodes.get(id);
        if (!node || this.disabled(node) || !this.branch(node)) return this;
        if (!this.expanded.has(id)) { this.expanded.add(id); this.notify('expand', node); }
        this.refresh();
        if (this.options.onLoadChildren && node.row[this.options.hasChildrenKey] && !node.children.length && !this.loaded.has(id)) await this.loadChildren(id);
        return this;
    }
    collapseNode(id) {
        this.assertActive(); const node = this.nodes.get(id);
        if (node && !this.disabled(node) && this.expanded.delete(id)) { this.notify('collapse', node); this.refresh(); }
        return this;
    }
    async expandAll() {
        this.assertActive(); const visited = new Set(), run = Symbol(); this.expandRun = run;
        while (!this.destroyed && this.expandRun === run) {
            const batch = [...this.nodes.values()].filter(node => !visited.has(node.id));
            if (!batch.length) break;
            const requests = [];
            for (const node of batch) {
                visited.add(node.id); if (this.disabled(node) || !this.branch(node)) continue;
                if (!this.expanded.has(node.id)) { this.expanded.add(node.id); this.notify('expand', node); }
                if (this.options.onLoadChildren && node.row[this.options.hasChildrenKey] && !node.children.length && !this.loaded.has(node.id)) requests.push(this.loadChildren(node.id));
            }
            this.refresh(); await Promise.all(requests);
        }
        return this;
    }
    collapseAll() { this.assertActive(); this.expandRun = null; for (const id of [...this.expanded]) { const node = this.nodes.get(id); if (node && !this.disabled(node)) { this.expanded.delete(id); this.notify('collapse', node); } } return this.refresh(); }
    async loadChildren(id) {
        if (this.pending.has(id)) return this.pending.get(id).promise;
        const node = this.nodes.get(id), request = { controller: new AbortController() };
        this.pending.set(id, request); this.errors.delete(id); this.message = ''; this.refresh();
        request.promise = (async () => {
            // Permite registrar la promesa antes de invocar al proveedor, incluso si falla sincrónicamente.
            await Promise.resolve();
            if (this.destroyed || this.pending.get(id) !== request) return;
            try {
                const detail = this.context(node, { signal: request.controller.signal });
                this.dispatchEvent(new CustomEvent('tree-load-children', { detail, bubbles: true, composed: true }));
                const children = await this.options.onLoadChildren(detail);
                if (this.destroyed || this.pending.get(id) !== request) return;
                const tree = createTree(this.getData(), this.options), data = tree.roots.map(node => node.row), parent = tree.nodes.get(id);
                this.sourceRow(parent, data)[this.options.childrenKey] = children;
                const next = createTree(data, this.options);
                const inheritSelection = this.options.selection === 'multiple' && this.options.propagateSelection && this.selected.has(id);
                this.pending.delete(id); this.loaded.add(id);
                if (inheritSelection) {
                    const stack = [...next.nodes.get(id).children];
                    while (stack.length) { const child = stack.pop(); if (this.disabled(child)) continue; this.selected.add(child.id); stack.push(...child.children); }
                }
                this.commit(next); if (inheritSelection) this.selectionChanged(this.nodes.get(id));
            } catch (error) {
                if (!this.destroyed && this.pending.get(id) === request) { this.errors.set(id, error?.message || String(error)); this.report(error, this.nodes.get(id), 'loadChildren'); }
            } finally {
                if (this.pending.get(id) === request) { this.pending.delete(id); if (!this.destroyed) this.refresh(); }
            }
        })();
        return request.promise;
    }
    setSearch(query) {
        this.assertActive(); if (typeof query !== 'string') throw new TypeError('Tree: búsqueda inválida.');
        if (!this.options.searchable) return this;
        if (!this.query.trim() && query.trim()) this.savedExpansion = new Set(this.expanded);
        if (this.query.trim() && !query.trim() && this.savedExpansion) { this.expanded = this.savedExpansion; this.savedExpansion = null; }
        this.query = query; this.items.clear(); return this.refresh();
    }
    mount() {
        if (!this.root) {
            this.root = el('section', 'tree'); this.toolbar = el('div', 'tree__toolbar');
            if (this.options.searchable) { const label = el('label', '', 'Buscar nodos '); this.search = el('input', 'tree__search'); this.search.type = 'search'; label.append(this.search); this.toolbar.append(label); }
            this.toolbar.append(button('Expandir todo', 'expand-all'), button('Contraer todo', 'collapse-all'));
            this.status = el('p', 'tree__status'); this.status.setAttribute('role', 'status');
            this.list = el('div', 'tree__list'); this.list.setAttribute('role', 'tree');
            this.list.setAttribute('aria-label', this.options.title); this.list.setAttribute('aria-multiselectable', String(this.options.selection === 'multiple'));
            this.root.append(this.toolbar, this.status, this.list); this.append(this.root);
        }
        if (!this.listeners) {
            this.listeners = new AbortController(); const options = { signal: this.listeners.signal };
            this.root.addEventListener('click', event => this.handleClick(event), options);
            this.root.addEventListener('dblclick', event => { const node = this.eventNode(event); if (node && !this.disabled(node)) this.notify('double-click', node); }, options);
            this.root.addEventListener('input', event => { if (event.target === this.search) this.setSearch(this.search.value); }, options);
            this.root.addEventListener('keydown', event => this.handleKey(event), options);
            this.root.addEventListener('focusin', event => { const node = this.eventNode(event); if (node) { this.focusId = node.id; this.paintFocus(); } }, options);
        }
    }
    refresh() {
        this.assertActive(); this.mount();
        const active = this.list.contains(document.activeElement);
        this.root.dataset.theme = this.options.theme; this.root.classList.toggle('tree--guides', this.options.guides);
        this.view = visibleTree(this.roots, this.nodes, this.expanded, this.query, this.options.searchKeys || [this.options.labelKey]);
        const visible = new Set(this.view.map(node => node.id));
        let focused = this.nodes.get(this.focusId);
        while (focused && (!visible.has(focused.id) || this.disabled(focused))) focused = focused.parent;
        this.focusId = focused?.id ?? this.view.find(node => !this.disabled(node))?.id ?? null;
        const fragment = document.createDocumentFragment();
        this.view.forEach((node, index) => {
            let item = this.items.get(node.id);
            if (!item) { item = this.drawNode(node); this.items.set(node.id, item); }
            item.dataset.index = index;
            item.setAttribute('aria-expanded', String(!!this.query.trim() || this.expanded.has(node.id)));
            if (!this.branch(node)) item.removeAttribute('aria-expanded');
            item.setAttribute('aria-busy', String(this.pending.has(node.id)));
            const toggle = item.querySelector('[data-command=toggle]');
            toggle.disabled = this.disabled(node) || !this.branch(node); toggle.setAttribute('aria-hidden', String(!this.branch(node)));
            toggle.textContent = this.pending.has(node.id) ? '…' : this.branch(node) ? (item.getAttribute('aria-expanded') === 'true' ? '⌄' : '›') : '';
            const error = this.errors.get(node.id);
            const retry = item.querySelector('[data-command=retry]'); retry.hidden = !error; retry.title = error || '';
            fragment.append(item);
        });
        this.list.replaceChildren(fragment); this.paintSelection(); this.paintFocus();
        this.list.tabIndex = this.focusId === null ? 0 : -1;
        if (this.search) this.search.value = this.query;
        this.status.textContent = this.message || (this.pending.size ? 'Cargando nodos…' : !this.nodes.size ? 'No hay nodos disponibles' : !this.view.length ? 'No se encontraron resultados' : `${this.view.length} nodos visibles`);
        if (active) (this.items.get(this.focusId) || this.list).focus();
        return this;
    }
    drawNode(node) {
        const item = el('div', 'tree__item'); item.setAttribute('role', 'treeitem'); item.tabIndex = -1;
        item.setAttribute('aria-label', String(node.row[this.options.labelKey] ?? 'Sin nombre'));
        item.setAttribute('aria-level', node.level); item.setAttribute('aria-disabled', String(this.disabled(node)));
        const siblings = node.parent?.children || this.roots;
        item.setAttribute('aria-posinset', siblings.indexOf(node) + 1); item.setAttribute('aria-setsize', siblings.length);
        item.style.setProperty('--tree-depth', node.level - 1);
        const toggle = button('', 'toggle'); toggle.classList.add('tree__toggle'); toggle.tabIndex = -1;
        toggle.setAttribute('aria-label', `Expandir o contraer ${node.row[this.options.labelKey] ?? node.id}`); toggle.disabled = this.disabled(node);
        item.append(toggle);
        if (this.options.selection === 'multiple') {
            const checkbox = el('input', 'tree__checkbox'); checkbox.type = 'checkbox'; checkbox.tabIndex = -1;
            checkbox.dataset.command = 'select'; checkbox.disabled = this.disabled(node); checkbox.setAttribute('aria-label', `Seleccionar ${node.row[this.options.labelKey] ?? node.id}`); item.append(checkbox);
        }
        const icon = el('span', 'tree__icon'); icon.setAttribute('aria-hidden', 'true');
        try {
            const custom = this.options.renderIcon?.(this.lazySnapshot(node));
            if (custom instanceof Node) icon.append(custom);
            else icon.textContent = custom ?? this.options.icons[node.row[this.options.iconKey]] ?? node.row[this.options.iconKey] ?? '';
        } catch (error) { this.report(error, node, 'renderIcon'); }
        const label = el('span', 'tree__label'); const text = String(node.row[this.options.labelKey] ?? 'Sin nombre');
        const query = this.query.trim(), index = text.toLocaleLowerCase('es').indexOf(query.toLocaleLowerCase('es'));
        if (this.options.highlight && query && index >= 0) label.append(document.createTextNode(text.slice(0, index)), el('mark', '', text.slice(index, index + query.length)), document.createTextNode(text.slice(index + query.length)));
        else label.textContent = text;
        if (this.options.renderLabel) {
            try {
                const rendered = this.options.renderLabel(this.lazySnapshot(node));
                if (!(rendered instanceof Node)) throw new TypeError('Tree: renderLabel debe devolver un nodo DOM.');
                label.replaceChildren(rendered); item.setAttribute('aria-label', label.textContent);
            } catch (error) { this.report(error, node, 'renderLabel'); }
        }
        const retry = button('Reintentar carga', 'retry'); retry.hidden = true; retry.tabIndex = -1;
        item.append(icon, label, retry); return item;
    }
    paintSelection() {
        const states = this.selectionStates();
        for (const [id, item] of this.items) {
            item.setAttribute('aria-selected', String(this.selected.has(id)));
            const checkbox = item.querySelector('input');
            if (checkbox) { const state = states.get(id); checkbox.checked = state === 'true'; checkbox.indeterminate = state === 'mixed'; item.setAttribute('aria-checked', state); }
        }
    }
    paintFocus() { for (const [id, item] of this.items) item.tabIndex = id === this.focusId ? 0 : -1; }
    eventNode(event) {
        if (event.target.closest('galeno-tree') !== this) return null;
        const item = event.target.closest('[role=treeitem]'); return item ? this.view[Number(item.dataset.index)] : null;
    }
    handleClick(event) {
        if (event.target.closest('galeno-tree') !== this) return;
        const control = event.target.closest('[data-command]'), command = control?.dataset.command;
        if (command === 'expand-all') { this.expandAll(); return; }
        if (command === 'collapse-all') { this.collapseAll(); return; }
        const node = this.eventNode(event); if (!node || this.disabled(node)) return;
        this.focusId = node.id; this.items.get(node.id)?.focus(); this.notify('click', node);
        if (command === 'toggle') { if (this.expanded.has(node.id)) this.collapseNode(node.id); else this.expandNode(node.id); }
        else if (command === 'retry') this.expandNode(node.id);
        else this.selectNode(node.id, command === 'select' ? control.checked : this.options.selection !== 'multiple' || !this.selected.has(node.id));
    }
    handleKey(event) {
        const node = this.eventNode(event); if (!node || this.disabled(node) || !['treeitem'].includes(event.target.getAttribute('role'))) return;
        const enabled = this.view.filter(item => !this.disabled(item)), index = enabled.indexOf(node); let target;
        if (event.key === 'ArrowDown') target = enabled[index + 1];
        else if (event.key === 'ArrowUp') target = enabled[index - 1];
        else if (event.key === 'Home') target = enabled[0];
        else if (event.key === 'End') target = enabled.at(-1);
        else if (event.key === 'ArrowRight') { if ((!this.expanded.has(node.id) && !this.query.trim()) || this.errors.has(node.id)) this.expandNode(node.id); else target = node.children.find(child => !this.disabled(child) && this.view.includes(child)); }
        else if (event.key === 'ArrowLeft') { if (this.expanded.has(node.id) && !this.query.trim()) this.collapseNode(node.id); else target = node.parent; }
        else if (event.key === 'Enter' || event.key === ' ') this.selectNode(node.id, this.options.selection !== 'multiple' || !this.selected.has(node.id));
        else return;
        event.preventDefault(); if (target && this.view.includes(target)) { this.focusId = target.id; this.paintFocus(); this.items.get(target.id)?.focus(); }
    }
    destroy() {
        if (this.destroyed) return;
        this.cancelLoads(); this.expandRun = null; this.listeners?.abort(); this.replaceChildren(); this.nodes.clear(); this.items.clear(); this.selected.clear(); this.expanded.clear(); this.loaded.clear(); this.errors.clear();
        this.roots = []; this.view = []; this.savedExpansion = null; this.options = {}; this.root = this.list = this.search = this.toolbar = this.status = this.listeners = null; this.destroyed = true;
    }
}
customElements.define('galeno-tree', Tree);
