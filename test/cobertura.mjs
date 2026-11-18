import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as esperar } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const raiz = fileURLToPath(new URL('../', import.meta.url));
const [navegador, archivoSalida] = process.argv.slice(2);

if (!navegador || !archivoSalida) {
    console.error('Uso: node test/cobertura.mjs RUTA_CHROMIUM INFORME.json');
    process.exit(1);
}

const { createInstrumenter } = require('istanbul-lib-instrument');
const { createCoverageMap } = require('istanbul-lib-coverage');

const mime = new Map([
    ['.js', 'text/javascript'], ['.html', 'text/html'], ['.css', 'text/css'],
    ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.json', 'application/json']
]);

async function instrumentar() {
    const mapa = createCoverageMap();
    const fuentes = new Map();
    for (const archivo of await readdir(join(raiz, 'src'), { recursive: true })) {
        if (!archivo.endsWith('.js')) continue;
        const ruta = 'src/' + archivo.split(sep).join('/');
        const codigo = await readFile(join(raiz, ruta), 'utf8');
        // Los iframe de las suites comparten contadores con el documento de prueba.
        const instrumento = createInstrumenter({
            coverageGlobalScope: 'globalThis.top ?? globalThis',
            coverageGlobalScopeFunc: false
        });
        fuentes.set(ruta, instrumento.instrumentSync(codigo, ruta));
        mapa.addFileCoverage(instrumento.lastFileCoverage());
    }
    return { mapa, fuentes };
}

function servidorLocal(fuentes) {
    return createServer(async (solicitud, respuesta) => {
        let ruta = new URL(solicitud.url, 'http://localhost').pathname.slice(1);
        if (ruta.endsWith('/')) ruta += 'index.html';
        if (!/^(src|test)\//.test(ruta)) {
            respuesta.writeHead(404).end();
            return;
        }
        try {
            const datos = fuentes.get(ruta) ?? await readFile(join(raiz, ruta));
            respuesta.setHeader('Content-Type', mime.get(extname(ruta)) ?? 'application/octet-stream');
            respuesta.end(datos);
        } catch {
            respuesta.writeHead(404).end();
        }
    });
}

function conectarCDP(proceso) {
    let secuencia = 0;
    let buffer = '';
    const pendientes = new Map();
    const salida = proceso.stdio[4];
    const entrada = proceso.stdio[3];

    salida.setEncoding('utf8').on('data', fragmento => {
        buffer += fragmento;
        for (let fin = buffer.indexOf('\0'); fin !== -1; fin = buffer.indexOf('\0')) {
            const mensaje = JSON.parse(buffer.slice(0, fin));
            buffer = buffer.slice(fin + 1);
            pendientes.get(mensaje.id)?.(mensaje);
        }
    });
    // El comando pendiente conserva su propio límite si Chromium cierra el canal.
    entrada.on('error', () => {});

    return (method, params, sessionId) => new Promise((confirmar, rechazar) => {
        const id = ++secuencia;
        const limite = setTimeout(() => {
            pendientes.delete(id);
            rechazar(new Error(`Chromium no respondió a ${method}`));
        }, 10000);
        pendientes.set(id, mensaje => {
            clearTimeout(limite);
            pendientes.delete(id);
            if (mensaje.error) rechazar(new Error(mensaje.error.message));
            else confirmar(mensaje.result);
        });
        entrada.write(JSON.stringify({ id, method, params, sessionId }) + '\0');
    });
}

async function medirNavegador(fuentes, mapa, temporal) {
    const servidor = servidorLocal(fuentes);
    await once(servidor.listen(0, '127.0.0.1'), 'listening');
    const proceso = spawn(navegador, [
        '--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking',
        '--remote-debugging-pipe', `--user-data-dir=${join(temporal, 'perfil')}`, 'about:blank'
    ], { stdio: ['ignore', 'ignore', 'inherit', 'pipe', 'pipe'] });
    const cierre = new Promise(confirmar => proceso.once('close', confirmar));
    let errorDeArranque;
    proceso.once('error', error => { errorDeArranque = error; });
    const cdp = conectarCDP(proceso);
    const suites = [];
    try {
        const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
        const paginas = (await readdir(join(raiz, 'test'))).filter(pagina => pagina.endsWith('_test.html')).sort();
        for (const pagina of paginas) {
            const url = `http://127.0.0.1:${servidor.address().port}/test/${pagina}`;
            await cdp('Page.navigate', { url }, sessionId);
            const limite = Date.now() + 30000;
            let captura;
            while (Date.now() < limite) {
                const expresion = `location.href.split('#')[0] === ${JSON.stringify(url)} && window.resultadoPruebas &&
                    ({ resultado: window.resultadoPruebas, cobertura: window.__coverage__ })`;
                const { result } = await cdp('Runtime.evaluate', { expression: expresion, returnByValue: true }, sessionId);
                if (result.value) {
                    captura = result.value;
                    break;
                }
                await esperar(100);
            }
            if (!captura) throw new Error(`${pagina} no publicó un resultado en 30 segundos`);
            mapa.merge(captura.cobertura ?? {});
            suites.push({ pagina, ...captura.resultado });
            const { aprobadas, fallidas, pendientes } = captura.resultado;
            console.log(`${pagina} — ${aprobadas} aprobadas, ${fallidas} fallidas, ${pendientes} pendientes`);
        }
        return suites;
    } catch (error) {
        throw errorDeArranque ?? error;
    } finally {
        proceso.kill();
        proceso.stdio[3].destroy();
        proceso.stdio[4].destroy();
        servidor.closeAllConnections();
        servidor.close();
        await cierre;
    }
}

async function medirWorker(fuentes, mapa, temporal) {
    const prueba = 'test/serviceWorker_test.mjs';
    const salida = join(temporal, 'worker.json');
    const inicio = join(temporal, 'instrumentacion.mjs');
    await cp(join(raiz, 'src'), join(temporal, 'src'), { recursive: true });
    await cp(join(raiz, prueba), join(temporal, prueba));
    await writeFile(join(temporal, 'src/serviceWorker.js'), fuentes.get('src/serviceWorker.js'));
    await writeFile(inicio, `import { writeFileSync } from 'node:fs';
globalThis.__coverage__ = {};
process.on('exit', () => writeFileSync(${JSON.stringify(salida)}, JSON.stringify(globalThis.__coverage__)));
`);
    const ejecucion = spawnSync(process.execPath, ['--import', inicio, join(temporal, prueba)], { stdio: 'inherit' });
    if (ejecucion.error) throw ejecucion.error;
    if (ejecucion.status !== 0) throw new Error('Fallaron las pruebas de Node.js del service worker');
    mapa.merge(JSON.parse(await readFile(salida, 'utf8')));
}

const temporal = await mkdtemp(join(tmpdir(), 'galeno-cobertura-'));
try {
    const { mapa, fuentes } = await instrumentar();
    const suites = await medirNavegador(fuentes, mapa, temporal);
    await medirWorker(fuentes, mapa, temporal);
    const resumen = mapa.getCoverageSummary().toJSON();
    const archivos = mapa.files().sort().map(ruta => {
        const cobertura = mapa.fileCoverageFor(ruta);
        const ramasPorLinea = cobertura.getBranchCoverageByLine();
        return {
            ruta,
            ...cobertura.toSummary().toJSON(),
            lineasSinCubrir: cobertura.getUncoveredLines().map(Number),
            lineasConRamasPendientes: Object.keys(ramasPorLinea).filter(linea =>
                ramasPorLinea[linea].covered < ramasPorLinea[linea].total).map(Number)
        };
    });
    await writeFile(resolve(archivoSalida), JSON.stringify({ resumen, suites, archivos }, null, 2) + '\n');
    console.log(`Líneas ${resumen.lines.pct} % · Ramas ${resumen.branches.pct} % · ${archivoSalida}`);
    if (suites.some(suite => suite.fallidas)) process.exitCode = 1;
} finally {
    await rm(temporal, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
}
