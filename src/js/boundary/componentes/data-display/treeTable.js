import { indexTree, treeView } from './tree_table_model.js';

function el(tag, className = '', text) {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}
function button(text, command) {
    const node = el('button', 'data-table__button', text);
    node.type = 'button'; node.dataset.command = command; return node;
}

export default class TreeTable extends HTMLElement {
    constructor() {
        super();
        this.options = { columns: [], data: [], rowKey: 'id', childrenKey: 'children', selection: 'single', searchable: true, sortable: true, title: 'Registros', actions: [], expanded: [] };
        this.nodes = new Map(); this.roots = []; this.expanded = new Set(); this.selected = new Set();
        this.query = ''; this.sort = null; this.loading = false; this.error = ''; this.destroyed = false;
    }
    connectedCallback() { if (!this.destroyed && this.options.columns.length) this.refresh(); }
    disconnectedCallback() { this.controller?.abort(); this.controller = null; }
    assertActive() { if (this.destroyed) throw new Error('TreeTable: componente destruido.'); }
    configure(options = {}) {
        this.assertActive();
        const next = { ...this.options, ...options };
        if (!Array.isArray(next.columns) || !next.columns.length || new Set(next.columns.map(c => c.key)).size !== next.columns.length ||
            next.columns.some(c => typeof c.key !== 'string' || !c.key.trim() || typeof c.label !== 'string' || !c.label.trim() ||
                ['formatter', 'renderCell'].some(key => c[key] !== undefined && typeof c[key] !== 'function') ||
                ['sortable', 'searchable'].some(key => c[key] !== undefined && typeof c[key] !== 'boolean') ||
                (c.align !== undefined && !['left', 'center', 'right'].includes(c.align)) ||
                (c.type !== undefined && !['string', 'number', 'date'].includes(c.type)) ||
                (c.width !== undefined && (typeof c.width !== 'string' || !CSS.supports('width', c.width)))) ||
            !['none', 'single', 'multiple'].includes(next.selection) || !Array.isArray(next.actions) || next.actions.some(a => !a || typeof a.label !== 'string' || !a.label.trim() || typeof a.onClick !== 'function' || (a.disabled !== undefined && !['boolean', 'function'].includes(typeof a.disabled)) || (a.variant !== undefined && !['default', 'danger'].includes(a.variant))) ||
            !['rowKey', 'childrenKey'].every(key => typeof next[key] === 'string' && next[key].trim()) ||
            !['searchable', 'sortable'].every(key => typeof next[key] === 'boolean') ||
            !(next.expanded === true || Array.isArray(next.expanded)) ||
            ['onSelect', 'onExpand', 'onCollapse', 'onSelectionChange', 'onAction', 'onError'].some(key => next[key] !== undefined && typeof next[key] !== 'function')) throw new TypeError('TreeTable: configuración inválida.');
        next.columns = next.columns.map(column => ({ ...column })); next.actions = next.actions.map(action => ({ ...action }));
        next.hierarchyColumn ??= next.columns[0].key;
        if (!next.columns.some(c => c.key === next.hierarchyColumn)) throw new TypeError('TreeTable: columna jerárquica inexistente.');
        const tree = indexTree(next.data, next.rowKey, next.childrenKey);
        this.options = next; Object.assign(this, tree); this.selected.clear();
        this.query = ''; this.searchExpanded = null; this.sort = null; this.search = null; this.error = ''; 
        this.expanded = new Set(next.expanded === true ? [...this.nodes.keys()] : next.expanded);
        this.replaceChildren(); this.root = null; this.controller?.abort(); this.controller = null;
        return this.refresh();
    }
    notify(type, node, extra = {}) {
        const detail = { id: node?.id, row: node ? { ...node.row } : null, level: node?.level, parentId: node?.parent?.id ?? null, ...extra };
        this.dispatchEvent(new CustomEvent(`tree-table-${type}`, { detail, bubbles: true, composed: true }));
        try { this.options[{ select: 'onSelect', expand: 'onExpand', collapse: 'onCollapse', 'selection-change': 'onSelectionChange', action: 'onAction', error: 'onError' }[type]]?.(detail); }
        catch (error) { if (type !== 'error') this.setError(error.message); }
    }
    setData(data) {
        this.assertActive();
        try {
            const tree = indexTree(data, this.options.rowKey, this.options.childrenKey);
            const previous = [...this.selected]; Object.assign(this, tree); this.options.data = data;
            this.selected = new Set(previous.filter(id => this.nodes.has(id)));
            this.expanded = new Set([...this.expanded].filter(id => this.nodes.has(id)));
            if (this.searchExpanded) this.searchExpanded = new Set([...this.searchExpanded].filter(id => this.nodes.has(id)));
            this.error = ''; this.refresh();
            if (previous.length !== this.selected.size) this.notify('selection-change', null, { rows: this.getSelectedRows() });
        } catch (error) { this.setError(error.message); }
        return this;
    }
    update(data) { return this.setData(data); }
    getSelectedRows() { this.assertActive(); return [...this.selected].map(id => ({ ...this.nodes.get(id).row })); }
    clearSelection() { this.assertActive(); this.selected.clear(); this.paintSelection(); this.notify('selection-change', null, { rows: [] }); return this; }
    selectNode(id, selected = true) {
        this.assertActive(); const node = this.nodes.get(id);
        if (!node || this.options.selection === 'none') return this;
        if (this.options.selection === 'single') this.selected.clear();
        if (selected) this.selected.add(id); else this.selected.delete(id);
        this.paintSelection(); this.notify('select', node); this.notify('selection-change', node, { rows: this.getSelectedRows() }); return this;
    }
    setExpanded(id, value, draw = true) {
        this.assertActive(); const node = this.nodes.get(id);
        if (!node?.children.length || this.expanded.has(id) === value) return this;
        if (value) this.expanded.add(id); else this.expanded.delete(id);
        this.notify(value ? 'expand' : 'collapse', node);
        return draw ? this.refresh() : this;
    }
    expandNode(id) { return this.setExpanded(id, true); }
    collapseNode(id) { return this.setExpanded(id, false); }
    expandAll() { this.assertActive(); for (const id of this.nodes.keys()) this.setExpanded(id, true, false); return this.refresh(); }
    collapseAll() { this.assertActive(); for (const id of [...this.expanded]) this.setExpanded(id, false, false); return this.refresh(); }
    setSearch(query) {
        this.assertActive();
        if (typeof query !== 'string') throw new TypeError('TreeTable: búsqueda inválida.');
        if (this.options.searchable) {
            if (!this.query.trim() && query.trim()) this.searchExpanded = new Set(this.expanded);
            if (this.query.trim() && !query.trim() && this.searchExpanded) { this.expanded = this.searchExpanded; this.searchExpanded = null; }
            this.query = query;
        }
        return this.refresh();
    }
    setSort(key, direction = 'asc') {
        this.assertActive(); const column = this.options.columns.find(c => c.key === key);
        if (this.options.sortable && column?.sortable === true && ['asc', 'desc', null].includes(direction)) this.sort = direction ? { key, direction } : null;
        return this.refresh();
    }
    setLoading(value) { this.assertActive(); this.loading = !!value; return this.refresh(); }
    setError(message = null) { this.assertActive(); this.error = message == null ? '' : String(message); if (this.error) this.notify('error', null, { message: this.error }); return this.refresh(); }
    mount() {
        if (!this.root) {
            this.classList.add('tree-table');
            this.root = el('section', 'data-table data-table--responsive');
            this.toolbar = el('div', 'data-table__toolbar');
            if (this.options.searchable) {
                const label = el('label', 'data-table__search-label', 'Buscar registros ');
                this.search = el('input', 'data-table__search'); this.search.type = 'search'; label.append(this.search); this.toolbar.append(label);
            }
            this.toolbar.append(button('Expandir todo', 'expand-all'), button('Contraer todo', 'collapse-all'));
            this.status = el('p', 'data-table__status'); this.status.setAttribute('role', 'status');
            const scroller = el('div', 'data-table__container');
            this.table = el('table', 'data-table__table'); this.table.setAttribute('role', 'treegrid');
            this.table.setAttribute('aria-multiselectable', String(this.options.selection === 'multiple'));
            this.table.append(el('caption', 'data-table__caption', this.options.title));
            this.head = el('thead'); this.body = el('tbody'); this.table.append(this.head, this.body); scroller.append(this.table);
            this.root.append(this.toolbar, this.status, scroller); this.append(this.root);
        }
        if (!this.controller) {
            this.controller = new AbortController(); const options = { signal: this.controller.signal };
            this.root.addEventListener('click', event => this.handleClick(event), options);
            this.root.addEventListener('input', event => { if (event.target === this.search) this.setSearch(this.search.value); }, options);
            this.root.addEventListener('keydown', event => this.handleKey(event), options);
            this.root.addEventListener('focusin', event => {
                const row = event.target.closest('tr[data-index]');
                if (row && row.closest('galeno-tree-table') === this) this.body.querySelectorAll('tr[data-index]').forEach(tr => { tr.tabIndex = tr === row ? 0 : -1; });
            }, options);
        }
    }
    refresh() {
        this.assertActive(); if (!this.options.columns.length) return this;
        this.mount();
        const active = document.activeElement;
        const focused = active?.closest('tr[data-index]'); const focusId = focused && this.view?.[Number(focused.dataset.index)]?.id;
        try {
            this.view = treeView(this.roots, this.nodes, this.options.columns, this.query, this.expanded, this.sort);
            const headState = JSON.stringify(this.sort);
            if (!this.head.childElementCount || this.headState !== headState) { this.drawHead(); this.headState = headState; }
            const fragment = document.createDocumentFragment();
            this.table.setAttribute('aria-busy', String(this.loading));
            this.status.setAttribute('role', this.error ? 'alert' : 'status');
            this.status.textContent = this.loading ? 'Cargando registros…' : this.error || (!this.nodes.size ? 'No hay registros disponibles' : !this.view.length ? 'No se encontraron resultados' : `${this.view.length} registros visibles`);
            if (this.search) this.search.value = this.query;
            if (this.loading || this.error || !this.view.length) {
                const tr = el('tr'), td = el('td', this.error ? 'data-table__error' : 'data-table__empty', this.status.textContent);
                td.colSpan = this.options.columns.length + Number(this.options.selection === 'multiple') + Number(!!this.options.actions.length); tr.append(td); fragment.append(tr);
            } else this.view.forEach((node, index) => fragment.append(this.drawRow(node, index)));
            this.body.replaceChildren(fragment); this.paintSelection();
            if (focusId !== undefined) {
                let node = this.nodes.get(focusId);
                while (node && !this.view.includes(node)) node = node.parent;
                this.body.querySelector(`[data-index="${this.view.indexOf(node)}"]`)?.focus();
            }
        } catch (error) {
            this.error = error.message; this.body.replaceChildren(); this.status.textContent = this.error; this.notify('error', null, { message: this.error });
        }
        return this;
    }
    drawHead() {
        const tr = el('tr');
        if (this.options.selection === 'multiple') { const th = el('th', 'data-table__header', 'Selección'); th.scope = 'col'; tr.append(th); }
        this.options.columns.forEach((column, index) => {
            const th = el('th', 'data-table__header'); th.scope = 'col';
            if (this.options.sortable && column.sortable === true) {
                th.setAttribute('aria-sort', this.sort?.key === column.key ? (this.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
                const control = button(column.label, 'sort'); control.dataset.column = index; th.append(control);
            } else th.textContent = column.label;
            tr.append(th);
        });
        if (this.options.actions.length) { const th = el('th', 'data-table__header', 'Acciones'); th.scope = 'col'; tr.append(th); }
        this.head.replaceChildren(tr);
    }
    drawRow(node, index) {
        const tr = el('tr', `data-table__row${node.children.length ? ' tree-table__parent' : ''}`);
        tr.dataset.index = index; tr.tabIndex = index === 0 ? 0 : -1;
        tr.setAttribute('aria-level', node.level);
        const siblings = node.parent?.children ?? this.roots;
        tr.setAttribute('aria-posinset', siblings.indexOf(node) + 1); tr.setAttribute('aria-setsize', siblings.length);
        if (node.children.length) tr.setAttribute('aria-expanded', String(!!this.query.trim() || this.expanded.has(node.id)));
        if (this.options.selection === 'multiple') {
            const td = el('td', 'data-table__cell'), input = el('input'); input.type = 'checkbox'; input.dataset.command = 'select';
            input.setAttribute('aria-label', `Seleccionar ${node.row[this.options.hierarchyColumn] ?? node.id}`); td.append(input); tr.append(td);
        }
        this.options.columns.forEach(column => {
            const td = el('td', `data-table__cell data-table__cell--${['left', 'right', 'center'].includes(column.align) ? column.align : 'left'}`);
            if (column.width) td.style.width = column.width;
            const content = el('span'); const value = node.row[column.key];
            if (column.renderCell) { const rendered = column.renderCell(value, { ...node.row }); if (!(rendered instanceof Node)) throw new TypeError('TreeTable: renderCell debe devolver un nodo DOM.'); content.append(rendered); }
            else content.textContent = (column.formatter ? column.formatter(value, { ...node.row }) : value) ?? '';
            if (column.key === this.options.hierarchyColumn) {
                const branch = el('span', 'tree-table__branch'); branch.style.paddingInlineStart = `${(node.level - 1) * 20}px`;
                const toggle = node.children.length ? button(tr.getAttribute('aria-expanded') === 'true' ? '▾' : '▸', 'toggle') : el('span', 'tree-table__spacer');
                if (node.children.length) toggle.setAttribute('aria-label', `${tr.getAttribute('aria-expanded') === 'true' ? 'Contraer' : 'Expandir'} ${node.row[column.key] ?? node.id}`);
                branch.append(toggle, content); td.append(branch);
            } else td.append(content);
            tr.append(td);
        });
        if (this.options.actions.length) {
            const td = el('td', 'data-table__cell');
            this.options.actions.forEach((action, index) => {
                const control = button(action.label, 'action'); control.dataset.action = index;
                control.disabled = typeof action.disabled === 'function' ? !!action.disabled({ ...node.row }) : !!action.disabled;
                if (action.variant === 'danger') control.classList.add('data-table__button--danger'); td.append(control);
            }); tr.append(td);
        }
        return tr;
    }
    paintSelection() {
        this.body?.querySelectorAll('tr[data-index]').forEach(tr => {
            const selected = this.selected.has(this.view[Number(tr.dataset.index)].id);
            if (this.options.selection !== 'none') tr.setAttribute('aria-selected', String(selected));
            const checkbox = tr.querySelector('input[data-command=select]'); if (checkbox) checkbox.checked = selected;
        });
    }
    handleClick(event) {
        if (this.loading || this.error || event.target.closest('galeno-tree-table') !== this) return;
        const control = event.target.closest('[data-command]');
        const tr = event.target.closest('tr[data-index]'), node = tr && this.view[Number(tr.dataset.index)];
        const command = control?.dataset.command;
        if (command === 'expand-all') return this.expandAll();
        if (command === 'collapse-all') return this.collapseAll();
        if (command === 'sort') {
            const column = this.options.columns[Number(control.dataset.column)];
            const direction = this.sort?.key === column.key ? (this.sort.direction === 'asc' ? 'desc' : null) : 'asc';
            this.setSort(column.key, direction);
            this.head.querySelector(`[data-column="${control.dataset.column}"]`)?.focus(); return;
        }
        if (!node || control?.disabled) return;
        if (command === 'toggle') return this.setExpanded(node.id, !this.expanded.has(node.id));
        if (command === 'action') {
            const action = this.options.actions[Number(control.dataset.action)];
            try { const result = action.onClick({ ...node.row }); Promise.resolve(result).catch(error => { if (!this.destroyed) this.setError(error.message); }); this.notify('action', node, { action: action.label }); }
            catch (error) { this.setError(error.message); } return;
        }
        if (command === 'select') return this.selectNode(node.id, control.checked);
        if (!event.target.closest('button,input,a,select,textarea')) this.selectNode(node.id);
    }
    handleKey(event) {
        if (this.loading || this.error || event.target.closest('galeno-tree-table') !== this) return;
        const tr = event.target.closest('tr[data-index]');
        if (!tr || event.target !== tr) return;
        const index = Number(tr.dataset.index), node = this.view[index]; let target;
        if (event.key === 'ArrowDown') target = this.view[index + 1];
        else if (event.key === 'ArrowUp') target = this.view[index - 1];
        else if (event.key === 'Home') target = this.view[0];
        else if (event.key === 'End') target = this.view.at(-1);
        else if (event.key === 'ArrowRight') { if (node.children.length && !this.expanded.has(node.id) && !this.query.trim()) this.expandNode(node.id); else target = node.children[0]; }
        else if (event.key === 'ArrowLeft') { if (this.expanded.has(node.id) && !this.query.trim()) this.collapseNode(node.id); else target = node.parent; }
        else if (event.key === 'Enter' || event.key === ' ') this.selectNode(node.id, this.options.selection === 'single' || !this.selected.has(node.id));
        else return;
        event.preventDefault();
        if (target) { const next = this.body.querySelector(`[data-index="${this.view.indexOf(target)}"]`); if (next) { tr.tabIndex = -1; next.tabIndex = 0; next.focus(); } }
    }
    destroy() {
        if (this.destroyed) return;
        this.controller?.abort(); this.replaceChildren(); this.nodes.clear(); this.roots = []; this.selected.clear(); this.expanded.clear(); this.view = [];
        this.searchExpanded = null; this.options = {}; this.root = this.body = this.head = this.table = this.toolbar = this.search = this.status = this.controller = null; this.destroyed = true;
    }
}
customElements.define('galeno-tree-table', TreeTable);
