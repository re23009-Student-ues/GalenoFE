import Tree from '../js/boundary/componentes/data-display/Tree.js';
const data = () => [
    { id: 'root', label: 'Proyecto', icon: 'folder', children: [
        { id: 'src', label: 'src', icon: 'folder', children: [{ id: 'main', label: 'main.js', icon: 'file' }] },
        { id: 'locked', label: 'Solo lectura', icon: 'lock', disabled: true },
        { id: 'remote', label: 'Recursos remotos', icon: 'cloud', hasChildren: true }
    ] }
];
class EjemploTree extends HTMLElement {
    connectedCallback() {
        if (this.trees) return;
        this.innerHTML = `<a href="./index.html">Todos los ejemplos</a><h1>Explorador Tree</h1>
            <p>Busca «main» para revelar tres niveles. Usa flechas, Enter o Espacio para navegar y seleccionar.</p>
            <h2>Selección individual</h2><div data-single></div>
            <h2>Checkboxes con propagación y carga diferida</h2><div data-multiple></div>
            <p>La primera carga remota falla para demostrar Reintentar carga. Solo se simulan datos locales.</p>
            <button type="button" data-add>Agregar archivo a src</button>
            <button type="button" data-remove>Eliminar archivo agregado</button>
            <button type="button" data-theme>Cambiar tema</button><p role="status" data-feedback></p>`;
        this.trees = [new Tree(), new Tree()]; this.nextId = 0; this.added = []; this.attempts = 0;
        const icons = { folder: '📁', file: '📄', lock: '🔒', cloud: '☁' };
        this.trees.forEach((tree, index) => {
            tree.configure({ data: data(), title: index ? 'Archivos seleccionables' : 'Archivos', icons,
                expanded: ['root'], selection: index ? 'multiple' : 'single',
                onSelectionChange: ({ nodes }) => { this.querySelector('[data-feedback]').textContent = `Selección: ${nodes.map(node => node.label).join(', ') || 'ninguna'}`; },
                onLoadChildren: ({ id, signal }) => new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        if (index && ++this.attempts === 1) reject(new Error('Fallo de carga simulado'));
                        else resolve([{ id: `${id}-child`, label: 'Archivo cargado.txt', icon: 'file' }]);
                    }, 600);
                    signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Cancelado', 'AbortError')); }, { once: true });
                })
            });
            this.querySelector(index ? '[data-multiple]' : '[data-single]').append(tree);
        });
        this.listener = event => {
            if (event.target.matches('[data-add]')) {
                const id = `new-${++this.nextId}`; this.added.push(id);
                this.trees.forEach(tree => { tree.addNode('src', { id, label: `Nuevo archivo ${this.nextId}.txt`, icon: 'file' }); tree.expandNode('src'); });
            }
            if (event.target.matches('[data-remove]') && this.added.length) { const id = this.added.pop(); this.trees.forEach(tree => tree.removeNode(id)); }
            if (event.target.matches('[data-theme]')) { this.dark = !this.dark; this.trees.forEach(tree => { tree.options.theme = this.dark ? 'dark' : 'light'; tree.refresh(); }); }
        };
        this.addEventListener('click', this.listener);
    }
    disconnectedCallback() { this.removeEventListener('click', this.listener); this.trees?.forEach(tree => tree.destroy()); this.trees = null; }
}
customElements.define('galeno-ejemplo-tree', EjemploTree);
