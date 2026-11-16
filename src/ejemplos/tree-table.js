import '../js/boundary/componentes/data-display/index.js';

const data = () => [
    { id: 1, nombre: 'Catálogo', estado: 'Activo', children: [
        { id: 2, nombre: 'Documentos', estado: 'Activo', children: [
            { id: 3, nombre: 'Informe anual', estado: 'Borrador' },
            { id: 4, nombre: 'Resumen', estado: 'Activo' }
        ] },
        { id: 5, nombre: 'Imágenes', estado: 'Activo' }
    ] },
    { id: 6, nombre: 'Archivo', estado: 'Inactivo' }
];
class EjemploTreeTable extends HTMLElement {
    connectedCallback() {
        if (this.table) return;
        this.innerHTML = `<a href="./index.html">Todos los ejemplos</a>
            <h1>Tabla jerárquica</h1>
            <p>Datos ficticios. Busca «Informe» para revelar tres niveles. Ordena con los encabezados y selecciona con los checkboxes o el teclado.</p>
            <galeno-tree-table></galeno-tree-table>
            <button type="button">Actualizar datos ficticios</button><p role="status"></p>`;
        const status = this.querySelector('[role=status]');
        this.table = this.querySelector('galeno-tree-table');
        this.table.configure({ title: 'Recursos', data: data(), selection: 'multiple', expanded: [1],
            columns: [{ key: 'nombre', label: 'Nombre', sortable: true }, { key: 'estado', label: 'Estado', sortable: true }],
            actions: [{ label: 'Ver', onClick: row => { status.textContent = `Recurso: ${row.nombre}`; } }],
            onSelectionChange: ({ rows }) => { status.textContent = `Seleccionados: ${rows.map(row => row.nombre).join(', ') || 'ninguno'}`; }
        });
        this.querySelector(':scope > button').onclick = () => {
            const next = data(); next[0].children[0].children.push({ id: 7, nombre: 'Nuevo informe', estado: 'Activo' });
            this.table.setData(next).expandNode(2); status.textContent = 'Datos actualizados';
        };
    }
    disconnectedCallback() { this.table?.destroy(); this.table = null; }
}
customElements.define('galeno-ejemplo-tree-table', EjemploTreeTable);
