// Publica el resultado de cada suite al índice que la contiene.
const ejecutarMocha = mocha.run.bind(mocha);
mocha.run = callback => {
    const runner = ejecutarMocha(callback);
    const errores = [];
    runner.on('fail', (caso, error) => errores.push({
        caso: caso.fullTitle(),
        mensaje: error.message
    }));
    runner.on('end', () => {
        window.resultadoPruebas = {
            aprobadas: runner.stats.passes,
            fallidas: runner.stats.failures,
            pendientes: runner.stats.pending,
            errores
        };
    });
    return runner;
};
