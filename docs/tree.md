# Tree: explorador de nodos reutilizable

Ubicación: `src/js/boundary/componentes/data-display/Tree.js`, exportado como
`Tree` desde `data-display/index.js` y registrado como `<galeno-tree>`.
Utiliza DOM ligero, CSS propio en `Recursos/estilos/tree.css` y datos locales o
un proveedor asíncrono independiente del transporte REST.

Se revisaron DataTable, TreeTable y Checkbox: conserva las convenciones
`configure`, `setData`, `refresh`, `destroy`, delegación y AbortController.
Comparte únicamente `indexTree`, validador iterativo sin DOM del modelo existente.
No instancia ni hereda TreeTable y no usa tablas, columnas o su CSS. Los
checkboxes internos son controles nativos gestionados por el Web Component,
como los del TreeTable; no requieren validación de formulario ni una instancia
de Checkbox con listeners por nodo.

```html
<link rel="stylesheet" href="Recursos/estilos/tree.css">
<galeno-tree id="explorador"></galeno-tree>
```

```javascript
import { Tree } from './js/boundary/componentes/data-display/index.js';
const tree = document.querySelector('#explorador');
tree.configure({
    title: 'Proyecto', selection: 'multiple', propagateSelection: true,
    expanded: [1], guides: true, theme: 'auto',
    icons: { folder: '📁', file: '📄' },
    data: [{ id: 1, label: 'Proyecto', icon: 'folder', children: [
        { id: 2, label: 'src', icon: 'folder', children: [
            { id: 3, label: 'main.js', icon: 'file' }
        ] }
    ] }],
    onSelectionChange: ({ nodes }) => console.log(nodes.map(node => node.label))
});
// Alternativa: const tree = new Tree(); tree.configure(options); host.append(tree);
```

## Opciones

| Opción | Predeterminado / contrato |
|---|---|
| `data` | `[]`; IDs globales únicos, texto no vacío o número finito |
| `rowKey`, `labelKey`, `iconKey`, `childrenKey` | `id`, `label`, `icon`, `children` |
| `disabledKey`, `hasChildrenKey` | `disabled`, `hasChildren` |
| `selection` | `single`, también `multiple` (checkboxes) y `none` |
| `propagateSelection` | `true`; en multiple, descendientes y agregación de padres |
| `expanded` | `[]`; arreglo de IDs o true para todos los nodos locales |
| `searchable`, `highlight`, `guides` | `true` |
| `searchKeys` | `[labelKey]`; nombres de propiedades buscables |
| `title` | `Explorador`; nombre accesible del árbol |
| `theme` | `auto` (preferencia del sistema), `light` o `dark` |
| `icons` | Mapa de nombres a texto/Unicode; sin dependencia de fuentes externas |
| `renderIcon(node)` | Opcional; devuelve Node DOM o texto |
| `renderLabel(node)` | Opcional; devuelve Node DOM y reemplaza la etiqueta/resaltado predeterminados; su texto se usa como nombre accesible |
| `onLoadChildren(context)` | Opcional; devuelve arreglo de hijos o Promise de arreglo |

Los textos, etiquetas e iconos de texto se insertan como texto seguro. Los nodos
DOM de renderIcon son responsabilidad del consumidor. Personalizar colores con
`--tree-background`, `--tree-text`, `--tree-muted`, `--tree-accent`,
`--tree-border`, `--tree-hover`, `--tree-selected` sobre `.tree`. Los valores
iniciales reutilizan `--fondo`, `--texto`, `--texto-suave` y `--azul-fuerte`.

Ejemplo con un DTO diferente:

```javascript
tree.configure({
    rowKey: 'codigo', labelKey: 'nombre', childrenKey: 'elementos',
    iconKey: 'simbolo', disabledKey: 'bloqueado', hasChildrenKey: 'remoto',
    selection: 'multiple', propagateSelection: false,
    searchKeys: ['nombre', 'descripcion'], highlight: false,
    data: [{ codigo: 'A', nombre: 'Administración', elementos: [] }]
});
```

## API

- `configure(options)`: valida antes de sustituir la configuración. Reinicia
  selección, expansión, búsqueda y cargas. Las opciones omitidas usan defaults.
- `setData(data)`: reemplaza datos; conserva selección/expansión de IDs existentes,
  elimina selecciones deshabilitadas y cancela cargas anteriores.
- `getData()`, `getNode(id)`: copias de la jerarquía; ID inexistente devuelve null.
- `addNode(parentId, node)`: `parentId: null` agrega una raíz.
- `updateNode(id, changes)`: actualiza propiedades o reemplaza hijos; ID inmutable.
- `removeNode(id)`: elimina la rama y reconcilia selección/foco.
- `expandNode(id)`, `expandAll()`: devuelven Promise del componente; se pueden
  esperar para terminar cargas. expandAll explora también los nuevos niveles
  diferidos: usar proveedores con árboles finitos. Ignora ramas deshabilitadas.
- `collapseNode(id)`, `collapseAll()`: contraen sin borrar datos cargados. Contraer
  durante una carga conserva la intención de permanecer contraído al completarla.
- `selectNode(id, selected = true)`, `clearSelection()`, `getSelectedNodes()`.
- `setSearch(text)`, `refresh()`, `destroy()`.

Salvo consultas, destroy y expansiones asíncronas, los métodos devuelven el
componente para encadenar llamadas. destroy es definitivo e idempotente; después
las operaciones públicas rechazan su uso. Las mutaciones inválidas conservan el
último árbol válido y emiten error; configure inválido lanza TypeError.
Se rechazan ciclos, objetos compartidos, IDs duplicados e hijos que no sean un
arreglo (null/ausente equivale a vacío). Los metadatos anidados ajenos a la
jerarquía se copian superficialmente y deben tratarse como inmutables.
Los hijos de snapshots en callbacks/selección se copian al acceder a ellos para
evitar recorrer subárboles innecesarios en operaciones masivas.

## Selección, búsqueda y accesibilidad

En modo multiple propagado, seleccionar un padre selecciona todos sus
descendientes habilitados y los padres reflejan true/mixed/false. Una rama
deshabilitada bloquea también sus descendientes y queda excluida de la
agregación. Sin propagación, los checkboxes son independientes. La selección
no expande nodos. La selección por API puede incluir nodos aún no visibles.

Buscar incluye coincidencias y antecesores entre los datos ya cargados;
no descarga ramas remotas. La expansión previa se restaura al limpiar la
búsqueda, incluso si se expandieron/contrajeron nodos durante el filtro.
La selección se conserva durante el filtro. No hay resultados y árbol vacío
son estados distintos. El resaltado es opcional y no interpreta HTML.

Roles tree/treeitem y aria-level, posinset, setsize, expanded, selected, checked,
disabled y busy. La lista plana expone explícitamente niveles y posiciones ARIA,
sin anidar miles de contenedores. Una sola fila entra en Tab. Flechas arriba/
abajo navegan entre nodos habilitados, derecha expande o entra al primer hijo,
izquierda contrae o vuelve al padre, Home/End saltan al inicio/final y
Enter/Espacio seleccionan. Los chevrons y checkboxes son clicables; el teclado
usa la fila. Un error remoto ofrece botón de reintento y ArrowRight lo reintenta.
Contraer o eliminar una rama devuelve el foco al antecesor visible.

## Carga diferida y eventos

```javascript
tree.configure({
    data: [{ id: 'remoto', label: 'Carpeta remota', hasChildren: true }],
    onLoadChildren: async ({ node, signal }) => {
        // El consumidor decide transporte, contexto y ruta.
        return obtenerHijos(node.id, { signal });
    },
    onError: ({ message, operation, id }) => console.error(operation, id, message)
});
await tree.expandNode('remoto');
```

Se deduplican solicitudes por ID; ramas distintas pueden cargar simultáneamente.
La expansión inicial también carga nodos marcados hasChildren. Un arreglo vacío
marca la rama como hoja, sin repetir cargas. Un fallo conserva el resto del árbol
y permite reintentar. Las mutaciones de una rama cancelan sus solicitudes
pendientes; setData, configure, desconectar y destroy cancelan todas. El proveedor
recibe AbortSignal, pero aun si ignora la cancelación, su respuesta obsoleta se
descarta. Los hijos nuevos heredan la selección propagada del padre seleccionado.

Callbacks: `onNodeClick`, `onNodeSelect`, `onNodeExpand`, `onNodeCollapse`,
`onSelectionChange`, `onNodeDoubleClick`, `onLoadChildren`, `onError`.
Eventos burbujeantes/composed: `tree-click`, `tree-select`, `tree-expand`,
`tree-collapse`, `tree-selection-change`, `tree-double-click`,
`tree-load-children`, `tree-error`. El evento load informa; solo el callback
onLoadChildren proporciona hijos. Contexto: `id`, `node`, `parentId`, `level`,
`tree`; selección añade `nodes`, carga añade `signal` y error añade `error`,
`message`, `operation`. Un callback de interacción fallido se reporta por onError;
un fallo de onError se contiene para evitar bucles.

## Organización y pruebas

Pruebas Mocha/Chai/Sinon: `test/tree_test.html` y
`test/js/data-display/tree_test.js`. Incluye modelo de 5.000 niveles, teclado,
propagación, filtros, mutaciones, cargas concurrentes y respuestas obsoletas.
El modelo recorre iterativamente; el DOM reutiliza elementos por ID. La selección
solo modifica atributos y checkboxes. Los listeners son delegados y se limpian
al desconectar/destruir; reconectar los reinstala una sola vez. Sin virtualización:
el coste depende de los nodos materializados/visibles y de sus metadatos.

## Integración en el dashboard

`galeno-agenda` presenta cada consulta en una `tarjeta-simple`, con nombre, edad y un documento disponible en tres líneas
del slot titulo y la fecha de la consulta a su derecha, con la hora debajo (America/El_Salvador); Tree en contenido y «Abrir consulta» en pie. El árbol
agrupa los pasos del rol y anteriores bajo su procedimiento, sin duplicarlos.
Los pasos siguientes son hijos del paso de origen según
procedimiento_paso_secuencia, independientemente del orden del JSON. Se incluyen
las definiciones del procedimiento aunque aún no tengan ejecución. Las raíces
sin predecesor cuelgan del procedimiento; los pasos sin relaciones permanecen
como raíces independientes. Los procedimientos y pasos se expanden y contraen
con chevrons y teclado. Inicialmente se abren solo los antecesores necesarios
para revelar pasos asignados al contexto actual. Las demás ramas, incluidos
los sucesores sin asignaciones propias, permanecen contraídas. La expansión
manual posterior se conserva al refrescar el árbol. En convergencias, el
paso y su continuación aparecen bajo cada predecesor con IDs de presentación
independientes. El tamaño visible depende de los caminos del grafo. Los ciclos o referencias a pasos
desconocidos muestran un error en lugar de fabricar una cadena. Añade « -responsable» cuando una ejecución válida
está asignada al idPersonaRol del contexto actual; compartir rol no basta.
La presentación omite grupos intermedios, metadatos y herramientas del árbol para mantener
las tarjetas mínimas. Se conservan navegación, accesibilidad y limpieza al
recargar, filtrar o desconectar. Pruebas: `test/js/agenda_test.js`.

En las tarjetas, la etiqueta de cada paso usa `renderLabel` para colocar el
estado Completado a la derecha. Clic o Enter/Espacio sobre una ejecución propia
abre la ruta protegida `/atencion/:idConsulta/paso/:idPaso`; los chevrons solo
expanden/contraen. Se revalida la asignación en Atención; un paso completado o
bloqueado conserva su modo de solo lectura. El botón Abrir consulta mantiene
la apertura general de la consulta sin un paso específico.

El documento del encabezado reutiliza documentoDelPaciente (lectura paginada
filtrada por persona). Las tarjetas del mismo paciente comparten una petición
por montaje; no se conserva caché entre cargas. Sin documento se omite la tercera
línea; sin fecha de nacimiento válida se muestra Edad no disponible. Los errores
de documento se indican sin bloquear los pasos. Respuestas de tarjetas retiradas
o cargas anteriores no actualizan la vista.
