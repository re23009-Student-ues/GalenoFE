import { assert } from '../lib/chai/index.js';
import { checkAgenda } from './paciente_agenda_cases.js';
mocha.setup('tdd');
suite('Agenda del paciente: pasos y responsables', () => {
    test('Adaptación, roles, cruce por consulta y paginación completa', async () => {
        await checkAgenda(assert.isTrue);
    });
});
mocha.run(failures => { document.body.dataset.testFailures = failures; });
