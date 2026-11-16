# Comparación de GalenoFE con GalenoSV

Revisión estática del 12 de noviembre de 2026. Fuente: `/home/ed_reboot/Documentos/Git_Proyects/galenoSV/repomix-output.xml`.

No se ejecutaron pruebas, compilaciones, peticiones HTTP ni servidores durante esta revisión. Los resultados de pruebas de la entrega anterior corresponden al código anterior a estos ajustes.

## Contratos confirmados

| Área | Backend observado | Frontend |
|---|---|---|
| Base REST | AppConfig: `resources/v1`; artefacto Maven `GalenoSV-1.0-SNAPSHOT` | Coincide con la URL base existente. El puerto depende del despliegue. |
| Documento | `GET documento/buscar?tipo={UUID}&valor={texto}`; 200/404/422/500 | Coincide con buscarDocumento y la validación pública. |
| Contextos | `GET persona_rol/persona/{UUID}`, array sin paginación | Coincide con rolesDePersona y selector laboral. |
| Consultas | `GET consulta?first&max` y `consulta/{id}` | Se mantienen composición local y consulta por identificador. No existen filtros REST de clínica/fechas. |
| Procedimientos y registros | `consulta_procedimiento`, `consulta_procedimiento_paso` | Relaciones anidadas y UUID usados por FE coinciden. |
| Definiciones | `procedimiento_paso/procedimiento/{UUID}?first&max` | Cuenta total real con countByIdProcedimiento. |
| Paginación | max entre 1 y 50; genéricos con Total-registros | Lectura de páginas de 50 y control de resultados incompletos. |
| CORS | Expone Total-registros | FE puede leer el total en solicitudes entre orígenes; no necesita leer Error-Msg. |
| Relaciones inversas | Getters con JsonbTransient | Correcto leer procedimientos y pasos por recursos separados. |
| Secuencias | Origen: idProcedimientoPaso; destino: idProcedimientoPasoReferencia | La búsqueda de antecesores coincide con ConsultaService. El controlador JSF crea tipo DEPENDIENTE. |
| Estados | Consulta.xhtml: PENDIENTE, EN_PROCESO, COMPLETADO | Se muestran como Pendiente, En proceso y Completado; valores distintos se conservan como texto. |
| Fechas | java.util.Date; vistas JSF con America/El_Salvador | Se conserva esa zona para HU1/HU3. El formato JSON y su offset requieren una respuesta real. |

Los métodos Java de filtrado por clínica/fechas y de carga detallada son servicios internos: no se encontraron rutas REST que los expongan. No se agregaron parámetros REST inventados.

Los endpoints persona_rol/pacientes, persona_rol/clinica/{id}/rol/{id} y procedimiento/activos devuelven lista.size() como Total-registros. No se usan como fuentes paginadas en HU1/HU3.

## Ajustes aplicados al frontend

1. **Ticket PDF:** ConsultaResource no publica consulta/{id}/ticket y el pom no contiene un generador PDF. El botón queda deshabilitado con el mensaje «El ticket PDF todavía no está disponible». Se conserva el adaptador de descarga para una integración posterior, controlada por TICKET_PDF_DISPONIBLE=false.
2. **Pasos del rol:** la agenda incorpora sus registros reales, con estado, responsable, fechas y anotación. Antes solo mostraba los nombres del catálogo para el rol; el detalle de ejecución se veía únicamente en los antecesores.
3. **Consultas sin fecha:** Consulta.fechaInicio admite null en el modelo. Se excluyen de los filtros de fechas para que un registro sin fecha no haga fallar toda la búsqueda.
4. **PWA:** caché estática incrementada a galenosv-v7 para distribuir los módulos modificados.

## Alcance pendiente

- El backend crea pasos como PENDIENTE y les asigna fechaInicio y responsable antes de atenderlos. Esa fecha o asignación no acredita que el paso haya comenzado o terminado.
- No se encontró en REST una regla que determine elegibilidad por estados y dependencias, ni selección de un paso concreto para HU4. Se conserva Abrir consulta como navegación de lectura; no se habilita atención ni avance automático.
- El PDF requiere implementación backend y posterior activación de su contrato en FE.
- La integración HTTP, CORS y serialización real de fechas no se verificaron por indicación del usuario de no hacer pruebas ahora.

No se modificó el backend ni el archivo Repomix. No se creó commit.
