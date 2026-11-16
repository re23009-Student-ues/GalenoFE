# Integración de HU1/HU3 en la nueva versión

Repositorio: GalenoFE indicado en la conversación.
Base revisada: `e806073` — agrega componentes reutilizables y detalle de atención. El árbol estaba limpio antes de los cambios.

## Trabajo aplicado

- Búsqueda pública `#/citas`: documento, clínicas del paciente, fechas, resultados, mensajes de error y descarte de respuestas tardías.
- Selector laboral por clínica/rol y revalidación del contexto en main, almacenamiento y router.
- Agenda de HU3 con procedimientos, pasos del rol, registros reales y antecesores por secuencias; se conservan estadísticas y gráficas.
- Descarga PDF deshabilitada mientras el backend no publique el endpoint; se conserva el adaptador para una integración posterior.
- Fechas de búsqueda en zona America/El_Salvador, exclusión de consultas sin fecha y paginación sin el corte silencioso de 1000 registros.
- Ruta compatible `/consulta/{id}` con consulta por identificador y verificación de clínica, conservando la agrupación de pasos y apertura de atención de esta versión.
- Archivos nuevos registrados en PWA; versión estática incrementada de v9 a v10 conservando los recursos previos.
- Cobertura de HU1/HU3 trasladada y adaptada, sin ejecutar pruebas.

## Cruces entre versiones y resolución

| Cruce | Resolución aplicada |
|---|---|
| Nuestro dashboard abría `/consulta/{id}`; la nueva versión incorpora el detalle `/atencion/{id}`. | El botón de la agenda HU3 navega a `/atencion/{id}`. Se conserva el router nuevo y la ruta de compatibilidad. |
| Nuestra coordinación de contexto comparte main.js con la nueva confirmación de cierre de sesión. | Se integró el evento de contexto sin sustituir ConfirmDialog. No se aceptan cambios de contexto mientras la confirmación está abierta y se invalidan respuestas previas. |
| La nueva versión calcula Finalizada mediante los pasos, en lugar de fechaFin. | Se preservan fechas.js, tarjeta-consulta y atencion-controller sin modificaciones. La agenda adicional presenta registros y estados sin cambiar esa regla. |
| La nueva versión ya usa caché v9 y contiene recursos adicionales. | Se conservan todos y solo se agregan seis recursos de HU1/HU3, con caché v10. |

No quedan conflictos de archivos pendientes de decisión. La elegibilidad de un paso para atender y el PDF siguen siendo pendientes funcionales ya identificados, no se dieron por implementados durante el traslado.

## Revisión realizada y límites

Se revisaron los cambios frente a e806073, las rutas/eventos, importaciones, registro PWA, documentos y componentes compartidos. La revisión es estática. No se ejecutaron suites, navegador, servidor, compilación ni peticiones HTTP durante este traslado. Los resultados de 102 pruebas de la implementación anterior no se atribuyen a esta versión.

No se agregaron dependencias externas a la aplicación ni se modificó el backend. Se conserva ECMAScript, Web Components y CSS propios. No se creó commit.
