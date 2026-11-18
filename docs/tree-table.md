# TreeTable

`galeno-tree-table` es un Web Component en light DOM. Importar el módulo o el
barrel `data-display/index.js` y cargar `Recursos/estilos/treeTable.css` (importa
los estilos propios del DataTable). No necesita registro en main para usarse en
un módulo. Ejecutar la suite en `test/treeTable_test.html`.

```javascript
import { TreeTable } from './js/boundary/componentes/data-display/index.js';
const tree = new TreeTable();
document.querySelector('#contenedor').append(tree);
tree.configure({
    title: 'Recursos', rowKey: 'id', childrenKey: 'items',
    hierarchyColumn: 'nombre', expanded: [1], selection: 'multiple',
    searchable: true, sortable: true,
    columns: [
        { key: 'nombre', label: 'Nombre', sortable: true },
        { key: 'cantidad', label: 'Cantidad', type: 'number', align: 'right' }
    ],
    data: [{ id: 1, nombre: 'Documentos', items: [{ id: 2, nombre: 'Informe' }] }],
    actions: [{ label: 'Ver', disabled: row => row.id === 1, onClick: row => console.log(row) }],
    onSelectionChange: ({ rows }) => console.log(rows)
});
```

También admite `<galeno-tree-table>` en HTML y `element.configure(options)`.
Cada fila exige un ID global único (texto no vacío o número finito); `1` y `'1'`
son diferentes. Los hijos ausentes/null se interpretan como arreglo vacío.
Rechaza ciclos, nodos compartidos y duplicados. No modifica el árbol recibido.
Las filas devueltas a callbacks son copias superficiales: los objetos anidados
siguen perteneciendo al consumidor y deben tratarse como datos inmutables.

Columnas: `key`, `label`, `sortable` (requiere true explícito), `searchable`
(false excluye), `type` (`string`, `number`, `date`), `align`, `width`,
`formatter(value, row)` para texto y `renderCell(value, row)` para un Node DOM.
El texto usa textContent; la seguridad de los nodos entregados corresponde al
consumidor. Acciones: `label`, `onClick(row)`, `disabled` booleano o función,
`variant: 'danger'` opcional. Las promesas rechazadas de acciones muestran error.

API encadenable: `configure(options)`, `setData(data)` (`update` alias),
`refresh()`, `setSearch(text)`, `setSort(key, 'asc' | 'desc' | null)`,
`expandNode(id)`, `collapseNode(id)`, `expandAll()`, `collapseAll()`,
`selectNode(id, selected = true)`, `clearSelection()`, `setLoading(boolean)`,
`setError(text | null)`. `getSelectedRows()` devuelve un arreglo; `destroy()` es
idempotente y definitivo. `configure` reinicia selección, búsqueda y orden.
`setData` conserva selección y expansión por ID; elimina IDs desaparecidos.

`selection`: `single` (predeterminado), `multiple` (checkboxes independientes,
sin propagación a descendientes) o `none`. `expanded`: arreglo de IDs o true.
La selección no se pierde al filtrar u ocultar una rama. IDs inexistentes se
ignoran. `searchable` y `sortable` son booleanos y están activos por defecto.

Callbacks: `onSelect`, `onExpand`, `onCollapse`, `onSelectionChange`, `onAction`,
`onError`. También emite eventos burbujeantes/composed `tree-table-select`,
`tree-table-expand`, `tree-table-collapse`, `tree-table-selection-change`,
`tree-table-action` y `tree-table-error`. Detail contiene `id`, `row`, `level`,
`parentId`; selección añade `rows`, acción añade `action` y error `message`.
Los callbacks de expansión se ejecutan solo si cambia el estado persistente.
Los errores de setData conservan el último árbol válido y muestran el error.
La configuración inválida lanza TypeError antes de sustituir los datos.

Para REST, el consumidor controla fetch, contexto, cancelación y respuestas
obsoletas; el componente no presupone rutas ni entidades:

```javascript
async function cargar(obtenerDatos) {
    tree.setError(null).setLoading(true);
    try { tree.setData(await obtenerDatos()); }
    catch (error) { tree.setError(error.message); }
    finally { tree.setLoading(false); }
}
```

Flechas arriba/abajo, Home/End navegan por filas visibles. Derecha expande o
entra al primer hijo; izquierda contrae o vuelve al padre. Enter/Espacio
seleccionan. Tab permite acceder a búsqueda, orden, expansión, checkboxes y
acciones con su comportamiento nativo. Contraer una rama con foco descendiente
lo devuelve al antecesor visible. La tabla expone treegrid, aria-level,
aria-expanded, aria-selected y aria-multiselectable.

Reutiliza filterRows/sortRows y CSS del DataTable sin heredar su controlador ni
su paginación plana. Ordena hermanos conservando sus descendientes. La búsqueda
incluye coincidencias y antecesores y restaura la expansión previa al limpiar.
Recorridos iterativos evitan desbordamiento de pila; delegación y AbortController
limpian listeners al desconectar, y al reconectar se registran una sola vez.
Búsqueda y expansión reconstruyen el cuerpo; el encabezado se actualiza solo
cuando cambia el orden o la configuración. Selección actualiza solo atributos y checkboxes. Conserva toolbar/buscador y foco. Usa fragmentos DOM,
sin virtualización; miles de filas visibles siguen teniendo un coste DOM lineal.
La transición es una animación breve de opacidad que respeta reduced-motion.

Pruebas Mocha/Chai/Sinon: servir el proyecto y abrir `test/treeTable_test.html`.
Incluyen un árbol de 5.000 niveles en el modelo, además de interacción DOM.

## Integración en el dashboard

La integración inicial de procedimientos con TreeTable fue sustituida por Tree
dentro de `tarjeta-simple`. Ver [Tree](tree.md#integración-en-el-dashboard).
El componente TreeTable permanece disponible para otras tablas jerárquicas.
