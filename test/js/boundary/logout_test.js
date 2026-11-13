import { assert } from '../lib/chai/index.js';

mocha.setup('tdd');
const wait = () => new Promise(resolve => setTimeout(resolve, 20));
async function until(predicate) {
    for (let i = 0; i < 100 && !predicate(); i++) await wait();
    assert.isTrue(!!predicate(), 'La aplicación completa el cambio esperado');
}

suite('Confirmar cierre de sesión (main.js real, REST simulado)', () => {
    let frame, doc, win, previousSession, previousPerson, requests;
    const user = { idPersonaRol: 'logout-demo', idRol: { idRol: 'doctor', nombre: 'Doctor' },
        idPersona: { idPersona: 'persona-logout', nombres: 'Ana', apellidos: 'Demo' }, idClinica: { idClinica: 'demo', nombre: 'Clínica ficticia' } };
    setup(async () => {
        previousSession = sessionStorage.getItem('sesionPersonaRol');
        previousPerson = sessionStorage.getItem('sesionPersona');
        sessionStorage.setItem('sesionPersonaRol', user.idPersonaRol);
        sessionStorage.setItem('sesionPersona', JSON.stringify(user.idPersona));
        frame = document.createElement('iframe');
        const loaded = new Promise(resolve => { frame.onload = resolve; });
        frame.src = './logout_fixture.html'; document.querySelector('#fixtures').append(frame); await loaded;
        doc = frame.contentDocument; win = frame.contentWindow; requests = [];
        win.caches.delete = async () => true;
        win.fetch = async (url, options) => {
            requests.push({ url, method: options.method });
            const path = new URL(url).pathname;
            const resource = path.includes('/persona_rol/persona/') ? 'persona_rol' : path.split('/').pop();
            assert.include(['persona_rol', 'consulta'], resource, 'Conserva los recursos existentes');
            return new Response(JSON.stringify(resource === 'persona_rol' ? [user] : []), {
                status: 200, headers: { 'Total-registros': resource === 'persona_rol' ? '1' : '0' }
            });
        };
        const script = doc.createElement('script'); script.type = 'module';
        const entry = new URL('../../../src/js/main.js', import.meta.url).href;
        script.textContent = `await import(${JSON.stringify(entry)}); document.dispatchEvent(new Event('DOMContentLoaded'));`;
        doc.body.append(script);
        await until(() => doc.querySelector('resumen-controller .stats'));
    });
    teardown(() => {
        frame?.remove();
        if (previousSession === null) sessionStorage.removeItem('sesionPersonaRol');
        else sessionStorage.setItem('sesionPersonaRol', previousSession);
        if (previousPerson === null) sessionStorage.removeItem('sesionPersona');
        else sessionStorage.setItem('sesionPersona', previousPerson);
    });
    const start = () => { doc.querySelector('#btn-salir').focus(); doc.querySelector('#btn-salir').click(); };
    const dialog = () => doc.querySelector('.confirm-dialog[open]');
    const stillLoggedIn = () => {
        assert.equal(sessionStorage.getItem('sesionPersonaRol'), user.idPersonaRol);
        assert.equal(JSON.parse(sessionStorage.getItem('sesionPersona')).idPersona, user.idPersona.idPersona);
        assert.isTrue(doc.querySelector('#pantalla-login').hidden);
        assert.exists(doc.querySelector('resumen-controller'));
        assert.strictEqual(doc.activeElement, doc.querySelector('#btn-salir'));
    };
    test('Permanecer conserva sesión, pantalla y foco; no consulta el backend', async () => {
        const calls = requests.length; start();
        assert.equal(doc.activeElement.textContent, 'Permanecer');
        dialog().querySelector('.confirm-dialog__cancel').click(); await wait();
        stillLoggedIn(); assert.equal(requests.length, calls);
        start(); dialog().querySelector('.confirm-dialog__cancel').click(); await wait(); stillLoggedIn();
    });
    for (const way of ['Escape', 'X', 'overlay']) test(`Cerrar mediante ${way} conserva sesión`, async () => {
        start(); const element = dialog();
        if (way === 'Escape') element.dispatchEvent(new win.Event('cancel', { cancelable: true }));
        else if (way === 'X') element.querySelector('.modal__close').click();
        else {
            element.dispatchEvent(new win.PointerEvent('pointerdown', { clientX: -1, clientY: -1 }));
            element.dispatchEvent(new win.MouseEvent('click', { clientX: -1, clientY: -1 }));
        }
        await wait(); stillLoggedIn();
    });
    test('Confirmar borra persona/contexto y vuelve al acceso público con los mismos endpoints', async () => {
        start(); dialog().querySelector('.confirm-dialog__confirm').click();
        await until(() => doc.querySelector('galeno-app').getAttribute('modo') === 'publico');
        assert.isNull(sessionStorage.getItem('sesionPersonaRol'));
        assert.isNull(sessionStorage.getItem('sesionPersona'));
        assert.equal(win.location.hash, '#/citas');
        assert.isTrue(doc.querySelector('#pantalla-login').hidden);
        assert.notExists(doc.querySelector('resumen-controller'));
        assert.isTrue(requests.every(request => request.method === 'GET'));
        assert.notExists(doc.querySelector('#btn-salir')); assert.notExists(dialog());
    });
    test('Clics repetidos no crean confirmaciones pendientes', async () => {
        start(); doc.querySelector('#btn-salir').click(); doc.querySelector('#btn-salir').click();
        assert.lengthOf(doc.querySelectorAll('.confirm-dialog[open]'), 1);
        dialog().querySelector('.confirm-dialog__cancel').click(); await wait();
        assert.notExists(dialog()); stillLoggedIn();
    });
    test('Desconectar la aplicación elimina la confirmación sin cerrar sesión', async () => {
        start(); doc.querySelector('galeno-app').remove(); await wait();
        assert.notExists(dialog());
        assert.equal(sessionStorage.getItem('sesionPersonaRol'), user.idPersonaRol);
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
