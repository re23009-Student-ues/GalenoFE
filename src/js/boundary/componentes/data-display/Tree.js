import { createTree, visibleTree } from './tree_model.js';

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
        super();
        this.nodes = new Map();
        this.roots = [];
        this.expanded = new Set();
        this.items = new Map();
        this.view = [];
        this.destroyed = false;
    }
    connectedCallback() { if (!this.destroyed) this.refresh(); }
    disconnectedCallback() { this.listeners?.abort(); this.listeners = null; }

    configure({ data, expanded = [], renderLabel, onNodeSelect }) {
        if (this.destroyed) throw new Error('Tree: componente destruido.');
        if (!Array.isArray(expanded) || typeof renderLabel !== 'function' || typeof onNodeSelect !== 'function') {
            throw new TypeError('Tree: configuración inválida.');
        }
        const tree = createTree(data);
        Object.assign(this, tree);
        this.expanded = new Set(expanded.filter(id => this.nodes.has(id)));
        this.renderLabel = renderLabel;
        this.onNodeSelect = onNodeSelect;
        this.selected = this.focusId = null;
        this.items.clear();
        return this.refresh();
    }
    disabled(node) { return !!node.disabled; }
    selectNode(node) {
        this.selected = node.id;
        this.paintSelection();
        try { this.onNodeSelect(node.row); }
        catch (error) { this.status.textContent = String(error?.message ?? error); }
    }
    expandNode(id) {
        const node = this.nodes.get(id);
        if (node?.children.length && !this.disabled(node)) {
            this.expanded.add(id);
            this.refresh();
        }
    }
    collapseNode(id) {
        if (this.expanded.delete(id)) this.refresh();
    }
    mount() {
        if (!this.root) {
            this.root = el('section', 'tree tree--guides');
            this.root.dataset.theme = 'light';
            this.status = el('p', 'tree__status');
            this.status.setAttribute('role', 'status');
            this.list = el('div', 'tree__list');
            this.list.setAttribute('role', 'tree');
            this.list.setAttribute('aria-label', 'Pasos de la consulta');
            this.root.append(this.status, this.list);
            this.append(this.root);
        }
        if (!this.listeners) {
            this.listeners = new AbortController(); const options = { signal: this.listeners.signal };
            this.root.addEventListener('click', event => this.handleClick(event), options);
            this.root.addEventListener('keydown', event => this.handleKey(event), options);
            this.root.addEventListener('focusin', event => { const node = this.eventNode(event); if (node) { this.focusId = node.id; this.paintFocus(); } }, options);
        }
    }
    refresh() {
        if (this.destroyed) return this;
        this.mount();
        const active = this.list.contains(document.activeElement);
        this.view = visibleTree(this.roots, this.expanded);
        const visible = new Set(this.view.map(node => node.id));
        let focused = this.nodes.get(this.focusId);
        while (focused && (!visible.has(focused.id) || this.disabled(focused))) focused = focused.parent;
        this.focusId = focused?.id ?? this.view.find(node => !this.disabled(node))?.id ?? null;
        this.status.textContent = this.nodes.size ? '' : 'No hay nodos disponibles';
        const fragment = document.createDocumentFragment();
        this.view.forEach((node, index) => {
            let item = this.items.get(node.id);
            if (!item) { item = this.drawNode(node); this.items.set(node.id, item); }
            item.dataset.index = index;
            const branch = node.children.length > 0;
            const expanded = this.expanded.has(node.id);
            if (branch) item.setAttribute('aria-expanded', String(expanded));
            const toggle = item.querySelector('[data-command=toggle]');
            toggle.disabled = this.disabled(node) || !branch;
            toggle.setAttribute('aria-hidden', String(!branch));
            toggle.textContent = branch ? (expanded ? '⌄' : '›') : '';
            fragment.append(item);
        });
        this.list.replaceChildren(fragment); this.paintSelection(); this.paintFocus();
        this.list.tabIndex = this.focusId === null ? 0 : -1;
        if (active) (this.items.get(this.focusId) || this.list).focus();
        return this;
    }
    drawNode(node) {
        const item = el('div', 'tree__item'); item.setAttribute('role', 'treeitem'); item.tabIndex = -1;
        item.setAttribute('aria-label', String(node.row.nombre ?? 'Sin nombre'));
        item.setAttribute('aria-level', node.level); item.setAttribute('aria-disabled', String(this.disabled(node)));
        const siblings = node.parent?.children || this.roots;
        item.setAttribute('aria-posinset', siblings.indexOf(node) + 1); item.setAttribute('aria-setsize', siblings.length);
        item.style.setProperty('--tree-depth', node.level - 1);
        const toggle = button('', 'toggle'); toggle.classList.add('tree__toggle'); toggle.tabIndex = -1;
        toggle.setAttribute('aria-label', `Expandir o contraer ${node.row.nombre ?? node.id}`); toggle.disabled = this.disabled(node);
        item.append(toggle);
        const label = el('span', 'tree__label', node.row.nombre ?? 'Sin nombre');
        if (this.renderLabel) {
            try {
                const rendered = this.renderLabel(node.row);
                if (!(rendered instanceof Node)) throw new TypeError('Tree: renderLabel debe devolver un nodo DOM.');
                label.replaceChildren(rendered);
                item.setAttribute('aria-label', label.textContent);
            } catch (error) { this.status.textContent = String(error?.message ?? error); }
        }
        item.append(label);
        return item;
    }
    paintSelection() {
        for (const [id, item] of this.items) item.setAttribute('aria-selected', String(id === this.selected));
    }
    paintFocus() { for (const [id, item] of this.items) item.tabIndex = id === this.focusId ? 0 : -1; }
    eventNode(event) {
        if (event.target.closest('galeno-tree') !== this) return null;
        const item = event.target.closest('[role=treeitem]');
        return item ? this.view[Number(item.dataset.index)] : null;
    }
    handleClick(event) {
        const node = this.eventNode(event);
        if (!node || this.disabled(node)) return;
        this.items.get(node.id)?.focus();
        if (event.target.closest('[data-command=toggle]')) {
            if (this.expanded.has(node.id)) this.collapseNode(node.id);
            else this.expandNode(node.id);
        } else this.selectNode(node);
    }
    handleKey(event) {
        const node = this.eventNode(event); if (!node || this.disabled(node) || event.target.getAttribute('role') !== 'treeitem') return;
        const enabled = this.view.filter(item => !this.disabled(item)), index = enabled.indexOf(node); let target;
        if (event.key === 'ArrowDown') target = enabled[index + 1];
        else if (event.key === 'ArrowUp') target = enabled[index - 1];
        else if (event.key === 'Home') target = enabled[0];
        else if (event.key === 'End') target = enabled.at(-1);
        else if (event.key === 'ArrowRight') { if (!this.expanded.has(node.id)) this.expandNode(node.id); else target = node.children.find(child => !this.disabled(child) && this.view.includes(child)); }
        else if (event.key === 'ArrowLeft') { if (this.expanded.has(node.id)) this.collapseNode(node.id); else target = node.parent; }
        else if (event.key === 'Enter' || event.key === ' ') this.selectNode(node);
        else return;
        event.preventDefault(); if (target && this.view.includes(target)) { this.focusId = target.id; this.paintFocus(); this.items.get(target.id)?.focus(); }
    }
    destroy() {
        if (this.destroyed) return;
        this.disconnectedCallback();
        this.replaceChildren();
        this.nodes.clear();
        this.items.clear();
        this.expanded.clear();
        this.roots = [];
        this.view = [];
        this.root = this.list = this.status = this.renderLabel = this.onNodeSelect = null;
        this.destroyed = true;
    }
}
customElements.define('galeno-tree', Tree);
