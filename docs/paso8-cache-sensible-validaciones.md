# Paso 8: caché sensible y validaciones

El frontend consulta REST exclusivamente desde la red. El backend indica que las
respuestas no deben almacenarse. Los archivos estáticos mantienen su respaldo
para abrir la interfaz sin conexión; consultar o revalidar datos requiere red.

## Cambios frontend

`src/js/control/transporte_rest.js` centraliza el transporte de DefaultService,
agenda y sesión. Fuerza `cache: no-store` incluso si el llamador solicita caché.
Mantiene parámetros, errores HTTP, Total-registros y Location. No introduce
contraseñas, cookies, CSRF ni autenticación backend.

Las lecturas tienen un límite de 10 segundos, incluido el consumo del cuerpo.
Al guardar sesión, cambiar contexto o cerrar sesión se incrementa una generación,
se rechazan las lecturas pendientes y se abortan sus solicitudes. También se
comprueban persona/rol antes y después del consumo, incluidas copias de Response;
un cambio de contexto de ida y vuelta no vuelve válida una respuesta anterior.

Las escrituras esperan 30 segundos como máximo. Agotar ese plazo informa que
falta confirmación, sin abortar la operación subyacente ni repetirla. Se conservan
los reintentos por borrador/idempotencia y los originales condicionales de los
pasos 6–7. Un cambio de contexto conserva la confirmación por status/Location,
pero impide aplicar su cuerpo en el contexto nuevo. Estos controles no sustituyen
la validación transaccional ni proporcionan autenticación.

El worker `galenosv-v16`, con entrada `main.js?v=11`, precarga el nuevo transporte.
Intercepta los GET de la API del mismo hostname y prefijo Galeno, aunque el puerto
sea distinto: usa únicamente red con no-store y plazo de 10 segundos hasta recibir
la respuesta. No abre, consulta ni escribe cachés REST. El transporte controla
además el plazo de consumo del cuerpo. Los errores HTTP se conservan y los fallos
de conexión nunca se sustituyen por respuestas históricas.

Activación elimina las versiones estáticas antiguas de Galeno y `galeno-api-*`.
Ingreso, contexto y salida también intentan eliminar estas últimas, preservando
estáticos y cachés de otras aplicaciones. Un fallo de almacenamiento no habilita
el respaldo REST. Un protocolo MessageChannel de 1,5 segundos comprueba el worker
controlador antes del fetch: bloquea versiones antiguas o silenciosas. Verifica
una vez cada controlador aprobado; una comprobación fallida puede reintentarse.
Sin controlador, usa directamente la red con no-store.

El indicador offline advierte que los datos visibles pueden estar desactualizados.
Puede quedar una vista ya renderizada en memoria; no implica una lectura reciente.
Si la revalidación de roles al restaurar sesión falla, el flujo existente limpia
la sesión y muestra el ingreso público. Se conserva el login amañado por documento
y las claves `sesionPersona` y `sesionPersonaRol`.

## Cambios backend

`CorsResponseFilter` fija en todas las respuestas REST, incluidos errores y
escrituras:

```http
Cache-Control: no-store, private, max-age=0
Pragma: no-cache
Expires: Thu, 01 Jan 1970 00:00:00 GMT
```

Conserva CORS y las cabeceras expuestas Location/Total-registros. No introduce
validadores ETag ni un contrato de revalidación 304. No cambia entidades, consultas,
índices ni esquema.

## Verificación

Resultados repetidos y guardados en esta sesión; no se suman ejecuciones anteriores:

| Comprobación | Aprobadas |
|---|---:|
| Backend, Maven offline en copia temporal | 267 |
| Frontend, Mocha/Chai/Sinon con REST real bloqueado | 242 |
| Versión del worker, Mocha | 3 |
| Worker, Node | 13 |
| REST real en Liberty/PostgreSQL desechables | 30 |
| Activación del worker real con HTTP sintético | 7 |

La suite nueva `test/cache_sensible_test.html` tiene 18 casos: no-store en los tres
transportes, fallos sin respaldo, plazos de lectura/cuerpo/escritura, contexto y
cambio de ida y vuelta, clones, confirmaciones de escritura, compatibilidad del
worker y limpieza selectiva. Se adaptaron las suites de sesión/shell para la
restauración exclusivamente en red y el mensaje offline. La regresión ejecuta
además atención, agenda, personal, login, logout y contratos de los pasos 2–7.

Backend añade `CacheSensibleResponseTest` y el arnés
`test/integration/cache-step8/` con semilla sintética. El REST real comprueba
cabeceras en consultas, estados, dashboard, identidad/documentos, relaciones,
errores, escrituras rechazadas, OPTIONS, HEAD, validadores antiguos y contextos.
Verifica total/paginación y hashes/conteos idénticos en las 20 tablas antes/después.
El arnés detiene su Liberty y elimina su contenedor; no usa db17 ni servidor habitual.

La prueba del worker usa Brave en un contexto propio y un servidor HTTP sintético:
bloquea un worker antiguo, activa v16, precarga recursos, elimina cachés históricas,
conserva una caché ajena, obtiene lecturas nuevas después de un POST sintético y
rechaza contexto anterior y respaldo antiguo ante un fallo real de red. Ese POST
solo modifica un contador en memoria del servidor de prueba. Esta prueba y la
integración REST backend son independientes: no constituyen una prueba completa
navegador–backend.

Comandos reproducibles:

```sh
# Frontend
node test/serviceWorker_test.mjs
# Backend: ejecutarlo en copia temporal, con Java 21 y dependencias ya instaladas
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 mvn -o test
bash test/integration/cache-step8/run.sh
```

Para las páginas Mocha, servir el frontend localmente y bloquear REST real antes
de navegar. Las pruebas usan sus propias simulaciones. Brave es el navegador
preferido para la CLI: `/usr/bin/brave-browser`, registrado en la configuración
global `~/.config/cd4a/config.json` por solicitud expresa del usuario. Usar siempre
un perfil/contexto de prueba independiente del perfil habitual.

Evidencia persistida: `test/evidence/paso8-cache-sensible-validaciones.json`.

## Límites y estado

Los clientes antiguos que nunca carguen la actualización no pueden purgarse desde
este código: necesitan conexión y activar la nueva versión. No se verificó la
versión del servidor habitual ni se desplegó. Los datos ya dibujados en memoria
no se eliminan de todas las pantallas por el transporte. No se modificaron datos
existentes, ejecutaron migraciones, instalaron dependencias ni hicieron commits.
El paso 9 no se implementó.
