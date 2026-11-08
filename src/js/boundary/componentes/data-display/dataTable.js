import { copyRows, filterRows, sortRows, paginateRows } from './data_table_model.js';

let sequence = 0;
const defaults = {
    data: [], columns: [], title: 'Registros', searchable: true, sortable: true,
    pagination: true, pageSize: 10, pageSizeOptions: [5, 10, 25, 50],
    selectable: false, rowKey: 'id', responsive: true, debounce: 200, actions: []
};
function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}
function button(text, command, label = text) {
    const node = element('button', 'data-table__button', text);
    node.type = 'button'; node.dataset.command = command; node.setAttribute('aria-label', label);
    return node;
}

export default class DataTable {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!(this.container instanceof Element)) throw new Error('DataTable: contenedor inexistente.');
        this.options = { ...defaults, ...options };
        this.validateOptions();
        this.columns = this.options.columns.map(column => ({ ...column }));
        this.actions = this.options.actions.map(action => ({ ...action }));
        this.data = copyRows(this.options.data, this.options);
        this.id = `data-table-${++sequence}`;
        this.page = 1; this.query = ''; this.sort = null;
        this.selected = new Set(); this.loading = false; this.error = ''; this.destroyed = false;
        this.collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
    }

    validateOptions() {
        const o = this.options;
        const invalid = message => { throw new TypeError(`DataTable: ${message}.`); };
        for (const key of ['searchable', 'sortable', 'pagination', 'selectable', 'responsive']) {
            if (typeof o[key] !== 'boolean') invalid(`${key} debe ser booleano`);
        }
        if (!Array.isArray(o.columns) || !o.columns.length) invalid('columns debe contener columnas');
        const keys = new Set();
        for (const column of o.columns) {
            if (!column || typeof column.key !== 'string' || !column.key.trim() || keys.has(column.key) ||
                typeof column.label !== 'string' || !column.label.trim()) invalid('cada columna necesita key única y label no vacíos');
            keys.add(column.key);
            if (column.align !== undefined && !['left', 'center', 'right'].includes(column.align)) invalid('align inválido');
            if (column.type !== undefined && !['string', 'number', 'date'].includes(column.type)) invalid('type debe ser string, number o date');
            for (const key of ['sortable', 'searchable']) {
                if (column[key] !== undefined && typeof column[key] !== 'boolean') invalid(`${key} de columna debe ser booleano`);
            }
            for (const key of ['formatter', 'renderCell']) {
                if (column[key] !== undefined && typeof column[key] !== 'function') invalid(`${key} debe ser una función`);
            }
            if (column.width !== undefined && (typeof column.width !== 'string' || !CSS.supports('width', column.width))) invalid('width de columna inválido');
        }
        if (!Number.isInteger(o.pageSize) || o.pageSize < 1 || !Array.isArray(o.pageSizeOptions) ||
            !o.pageSizeOptions.length || o.pageSizeOptions.some(size => !Number.isInteger(size) || size < 1)) invalid('tamaños de página inválidos');
        if (!Number.isFinite(o.debounce) || o.debounce < 0) invalid('debounce debe ser un número >= 0');
        if (typeof o.rowKey !== 'string' || !o.rowKey.trim()) invalid('rowKey debe ser texto no vacío');
        if (!Array.isArray(o.actions)) invalid('actions debe ser un arreglo');
        for (const action of o.actions) {
            if (!action || typeof action.label !== 'string' || !action.label.trim() || typeof action.onClick !== 'function' ||
                (action.disabled !== undefined && typeof action.disabled !== 'boolean' && typeof action.disabled !== 'function') ||
                (action.variant !== undefined && !['default', 'danger'].includes(action.variant))) invalid('acción inválida');
        }
    }

    assertActive() {
        if (this.destroyed) throw new Error('DataTable: la instancia fue destruida.');
    }

    render() {
        this.assertActive();
        if (!this.root) this.mount();
        this.draw();
        return this;
    }

    mount() {
        const o = this.options;
        this.root = element('section', `data-table${o.responsive ? ' data-table--responsive' : ''}`);
        this.toolbar = element('div', 'data-table__toolbar');
        if (o.searchable) {
            const label = element('label', 'data-table__search-label', 'Buscar registros');
            this.searchInput = element('input', 'data-table__search');
            this.searchInput.type = 'search'; this.searchInput.id = `${this.id}-search`;
            label.htmlFor = this.searchInput.id;
            this.searchInput.placeholder = 'Buscar…'; this.searchInput.value = this.query;
            this.toolbar.append(label, this.searchInput);
        }
        this.status = element('p', 'data-table__status');
        this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
        this.scroller = element('div', 'data-table__container');
        this.scroller.tabIndex = 0; this.scroller.setAttribute('role', 'region');
        this.scroller.setAttribute('aria-label', `${o.title}: tabla desplazable`);
        this.table = element('table', 'data-table__table');
        this.table.append(element('caption', 'data-table__caption', o.title));
        this.head = document.createElement('thead'); this.body = document.createElement('tbody');
        this.table.append(this.head, this.body); this.scroller.append(this.table);
        this.footer = element('nav', 'data-table__pagination');
        this.footer.setAttribute('aria-label', `Paginación: ${o.title}`);
        this.root.append(this.toolbar, this.status, this.scroller, this.footer);
        this.onClick = event => this.handleClick(event);
        this.onChange = event => this.handleChange(event);
        this.onInput = event => {
            if (event.target !== this.searchInput) return;
            clearTimeout(this.timer);
            const query = this.searchInput.value;
            this.timer = setTimeout(() => this.setSearch(query), this.options.debounce);
        };
        this.root.addEventListener('click', this.onClick);
        this.root.addEventListener('change', this.onChange);
        this.root.addEventListener('input', this.onInput);
        this.container.append(this.root);
    }

    update(data) {
        this.assertActive();
        const next = copyRows(data, this.options);
        this.data = next;
        const keys = new Set(next.map(row => row[this.options.rowKey]));
        this.selected = new Set([...this.selected].filter(key => keys.has(key)));
        this.error = '';
        return this.render();
    }

    setLoading(isLoading) {
        this.assertActive();
        if (typeof isLoading !== 'boolean') throw new TypeError('DataTable: isLoading debe ser booleano.');
        this.loading = isLoading;
        return this.render();
    }

    setError(message = null) {
        this.assertActive();
        if (message !== null && typeof message !== 'string') throw new TypeError('DataTable: el error debe ser texto o null.');
        this.error = message || '';
        return this.render();
    }

    setPage(page) {
        this.assertActive();
        if (!Number.isInteger(page) || page < 1) throw new TypeError('DataTable: page debe ser un entero >= 1.');
        if (this.options.pagination) this.page = page;
        return this.render();
    }

    setSearch(query) {
        this.assertActive();
        if (typeof query !== 'string') throw new TypeError('DataTable: query debe ser texto.');
        clearTimeout(this.timer);
        if (this.options.searchable) { this.query = query; this.page = 1; }
        if (this.searchInput) this.searchInput.value = this.query;
        return this.render();
    }

    clearSelection() {
        this.assertActive(); this.selected.clear(); return this.render();
    }

    getSelectedRows() {
        this.assertActive();
        return this.options.selectable ? this.data.filter(row => this.selected.has(row[this.options.rowKey])).map(row => ({ ...row })) : [];
    }

    getView() {
        const filtered = filterRows(this.data, this.columns, this.options.searchable ? this.query : '');
        const column = this.sort ? this.columns.find(column => column.key === this.sort.key) : null;
        const ordered = sortRows(filtered, column, this.sort?.direction, this.collator);
        return paginateRows(ordered, this.page, this.options.pageSize, this.options.pagination);
    }

    draw() {
        const focus = this.root.contains(document.activeElement) ? document.activeElement.dataset.focus : undefined;
        const view = this.getView(); this.page = view.page; this.view = view;
        const blocked = this.loading || !!this.error;
        this.table.setAttribute('aria-busy', String(this.loading));
        if (this.searchInput) this.searchInput.disabled = blocked;
        this.head.replaceChildren(); this.body.replaceChildren(); this.footer.replaceChildren();
        const headers = document.createElement('tr');
        if (this.options.selectable) {
            const th = document.createElement('th'); th.scope = 'col';
            const selectAll = this.checkbox('Seleccionar filas de esta página', 'all');
            const count = view.rows.filter(row => this.selected.has(row[this.options.rowKey])).length;
            selectAll.checked = !!view.rows.length && count === view.rows.length;
            selectAll.indeterminate = count > 0 && count < view.rows.length;
            selectAll.disabled = blocked || !view.rows.length;
            th.append(selectAll); headers.append(th);
        }
        this.columns.forEach((column, index) => {
            const th = element('th', 'data-table__header'); th.scope = 'col';
            this.styleColumn(th, column);
            if (this.options.sortable && column.sortable === true) {
                const direction = this.sort?.key === column.key ? this.sort.direction : null;
                th.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none');
                const control = button(`${column.label} ${direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '↕'}`, 'sort', `Ordenar por ${column.label}`);
                control.dataset.column = index; control.dataset.focus = `sort-${index}`; control.disabled = blocked;
                th.append(control);
            } else th.textContent = column.label;
            headers.append(th);
        });
        if (this.actions.length) { const th = element('th', 'data-table__header', 'Acciones'); th.scope = 'col'; headers.append(th); }
        this.head.append(headers);
        let message = this.loading ? 'Cargando registros…' : this.error ||
            (!this.data.length ? 'No hay registros disponibles' : !view.total ? 'No se encontraron resultados' : '');
        if (message) {
            const row = document.createElement('tr');
            const cell = element('td', this.loading ? 'data-table__loading' : this.error ? 'data-table__error' : 'data-table__empty', message);
            cell.colSpan = this.columns.length + Number(this.options.selectable) + Number(!!this.actions.length);
            row.append(cell); this.body.append(row);
        } else view.rows.forEach((row, index) => this.drawRow(row, index));
        const info = view.total ? `Mostrando ${view.start + 1}–${view.start + view.rows.length} de ${view.total} registros` : 'Mostrando 0–0 de 0 registros';
        this.status.textContent = message || info;
        if (this.options.pagination) this.drawPagination(view, blocked);
        if (focus) [...this.root.querySelectorAll('[data-focus]')].find(node => node.dataset.focus === focus)?.focus();
    }

    styleColumn(node, column) {
        node.classList.add(`data-table__cell--${column.align || 'left'}`);
        if (column.width) node.style.width = column.width;
    }

    checkbox(label, command) {
        const input = document.createElement('input'); input.type = 'checkbox';
        input.setAttribute('aria-label', label); input.dataset.command = command;
        input.dataset.focus = command;
        return input;
    }

    drawRow(row, index) {
        const tr = element('tr', 'data-table__row');
        if (this.options.selectable) {
            const cell = element('td', 'data-table__cell');
            const input = this.checkbox(`Seleccionar registro ${row[this.options.rowKey]}`, 'select');
            input.dataset.row = index; input.dataset.focus = `select-${index}`;
            input.checked = this.selected.has(row[this.options.rowKey]); cell.append(input); tr.append(cell);
        }
        this.columns.forEach(column => {
            const cell = element('td', 'data-table__cell'); this.styleColumn(cell, column);
            const value = row[column.key];
            if (column.renderCell) {
                const node = column.renderCell(value, { ...row });
                if (!(node instanceof Node)) throw new TypeError('DataTable: renderCell debe devolver un nodo DOM.');
                cell.append(node);
            } else {
                const text = column.formatter ? column.formatter(value, { ...row }) : value;
                if (text instanceof Node) throw new TypeError('DataTable: usa renderCell para devolver nodos DOM.');
                cell.textContent = text == null ? '' : String(text);
            }
            tr.append(cell);
        });
        if (this.actions.length) {
            const cell = element('td', 'data-table__cell');
            const controls = element('div', 'data-table__actions');
            this.actions.forEach((action, actionIndex) => {
                const control = button(action.label, 'action', `${action.label}: registro ${row[this.options.rowKey] ?? this.view.start + index + 1}`);
                if (action.variant === 'danger') control.classList.add('data-table__button--danger');
                control.dataset.row = index; control.dataset.action = actionIndex; control.dataset.focus = `action-${index}-${actionIndex}`;
                control.disabled = typeof action.disabled === 'function' ? !!action.disabled({ ...row }) : !!action.disabled;
                controls.append(control);
            });
            cell.append(controls); tr.append(cell);
        }
        this.body.append(tr);
    }

    drawPagination(view, blocked) {
        const previous = button('Anterior', 'previous', 'Página anterior');
        previous.disabled = blocked || view.page === 1; previous.dataset.focus = 'previous';
        const next = button('Siguiente', 'next', 'Página siguiente');
        next.disabled = blocked || view.page === view.pages; next.dataset.focus = 'next';
        const label = element('label', 'data-table__page-size', 'Registros por página ');
        const select = document.createElement('select'); select.dataset.command = 'size'; select.dataset.focus = 'size';
        select.setAttribute('aria-label', 'Registros por página'); select.disabled = blocked;
        [...new Set([...this.options.pageSizeOptions, this.options.pageSize])].sort((a, b) => a - b).forEach(size => {
            const option = element('option', '', String(size)); option.value = size; select.append(option);
        });
        select.value = this.options.pageSize; label.append(select);
        this.footer.append(label, previous, element('span', 'data-table__page-info', `Página ${view.page} de ${view.pages}`), next);
    }

    handleClick(event) {
        const control = event.target.closest('button[data-command]');
        if (!control || !this.root.contains(control) || control.closest('.data-table') !== this.root || control.disabled || this.loading || this.error) return;
        const command = control.dataset.command;
        if (command === 'previous') this.setPage(this.page - 1);
        if (command === 'next') this.setPage(this.page + 1);
        if (command === 'sort') {
            const column = this.columns[Number(control.dataset.column)];
            if (!column || !this.options.sortable || column.sortable !== true) return;
            this.sort = this.sort?.key !== column.key ? { key: column.key, direction: 'asc' } :
                this.sort.direction === 'asc' ? { key: column.key, direction: 'desc' } : null;
            this.page = 1; this.draw();
        }
        if (command === 'action') {
            const row = this.view.rows[Number(control.dataset.row)];
            this.actions[Number(control.dataset.action)].onClick({ ...row });
        }
    }

    handleChange(event) {
        const control = event.target;
        if (control.closest('.data-table') !== this.root || control.disabled || this.loading || this.error) return;
        const command = control.dataset.command;
        if (command === 'size' && this.options.pagination) {
            this.options.pageSize = Number(control.value); this.page = 1; this.draw();
        }
        if (this.options.selectable && (command === 'all' || command === 'select')) {
            const rows = command === 'all' ? this.view.rows : [this.view.rows[Number(control.dataset.row)]];
            rows.forEach(row => {
                const key = row[this.options.rowKey];
                if (control.checked) this.selected.add(key); else this.selected.delete(key);
            });
            this.draw();
        }
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true; clearTimeout(this.timer);
        this.root?.removeEventListener('click', this.onClick);
        this.root?.removeEventListener('change', this.onChange);
        this.root?.removeEventListener('input', this.onInput);
        this.root?.remove(); this.selected.clear(); this.data = []; this.view = null;
        this.root = this.table = this.toolbar = this.searchInput = this.status = this.scroller = this.head = this.body = this.footer = null;
        this.onClick = this.onChange = this.onInput = null;
        this.columns = []; this.actions = []; this.options = null; this.container = null;
    }
}
