# Tree de Agenda

`galeno-tree` presenta los procedimientos y pasos de cada tarjeta de Agenda.
Recibe una jerarquía ya cargada y validada por el flujo de agenda.

```js
const arbol = new Tree();
arbol.configure({
    data: [{ id: 'procedimiento', nombre: 'Procedimiento', children: [
        { id: 'paso', nombre: 'Atención', responsable: true, idPaso: 'ejecución' }
    ] }],
    expanded: ['procedimiento'],
    renderLabel: nodo => document.createTextNode(nodo.nombre),
    onNodeSelect: nodo => abrirPaso(nodo)
});
tarjeta.append(arbol);
```

El modelo valida identificadores únicos y rechaza ciclos y nodos compartidos.
La selección es simple. Clic, Enter y Espacio seleccionan el nodo enfocado.
Las flechas, Inicio y Fin recorren la jerarquía. Agenda verifica que el nodo
corresponda a un paso propio antes de navegar. `destroy()` libera el DOM y
los listeners cuando Agenda sustituye la tarjeta.

## Organización y pruebas

Pruebas Mocha/Chai/Sinon: `test/tree_test.html` y
`test/js/data-display/tree_test.js`. Incluye modelo de 5.000 niveles, teclado,
selección simple, validación de jerarquía y reconexión.
El modelo recorre iterativamente; el DOM reutiliza elementos por ID. La selección
actualiza el atributo `aria-selected`. Los listeners son delegados y se limpian
al desconectar/destruir; reconectar los reinstala una sola vez. Sin virtualización:
el coste depende de los nodos materializados/visibles y de sus metadatos.

## Integración en el dashboard

`src/js/boundary/componentes/agenda.js` crea un árbol por tarjeta, abre
inicialmente las ramas que revelan asignaciones propias y añade el estado
Completado a la etiqueta cuando corresponde. Las reglas visuales están en
`tree.css` y `agenda.css`.
