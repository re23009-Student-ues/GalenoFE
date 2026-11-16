# Resumen de consulta PDF

GalenoSV genera el archivo con OpenPDF 2.0.5. GalenoFE conserva `ticketPDF` y la
ruta GET `consulta/{id}/ticket` para reutilizar el flujo existente; el botón y el
nombre del archivo ahora indican que se descarga un resumen de consulta.

El backend devuelve application/pdf y Content-Disposition con nombre
consulta-UUID.pdf. El archivo incluye paciente, clínica, fechas registradas,
observaciones, referencia externa, procedimientos y atención de sus pasos reales.
No calcula estados nuevos; omite ejecuciones INVALIDO como el flujo actual.
Ordena por fecha de inicio e identificador para una presentación estable, sin
alterar el grafo ni presentar ese orden como una secuencia clínica.

Datos opcionales ausentes: Sin registrar. Sin procedimientos/pasos: mensaje
explícito. UUID inválido: 422; consulta inexistente: 404; generación fallida: 500.
Errores no se descargan como PDF; el botón permite reintentar y bloquea duplicados.
Se conserva el transporte REST sin caché y la revocación de Object URL.

La versión PWA es galenosv-v28 / main.js?v=23. Desplegar primero el WAR backend
actualizado y luego el frontend; no hay migraciones de base de datos.

Se conserva el acceso actual: búsqueda pública de citas y sesión simulada.
Este cambio no añade autenticación backend; el UUID no es una credencial.
El resumen contiene atención clínica, por lo que el despliegue con datos reales
requiere resolver el control de acceso del sistema antes de exponerlo públicamente.
