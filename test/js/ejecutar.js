const boton = document.querySelector('#ejecutar');
const resumen = document.querySelector('#resumen');
const enlaces = [...document.querySelectorAll('#suites a')];

async function ejecutarSuite(enlace) {
    const marco = document.createElement('iframe');
    marco.style.cssText = 'position: fixed; left: -1200px; top: 0; width: 1000px; height: 800px';
    marco.src = enlace.href;
    document.body.append(marco);
    try {
        const limite = Date.now() + 30000;
        while (Date.now() < limite) {
            const resultado = marco.contentWindow.resultadoPruebas;
            if (resultado) return resultado;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error('La suite no publicó un resultado en 30 segundos');
    } finally {
        marco.remove();
    }
}

boton.addEventListener('click', async () => {
    boton.disabled = true;
    window.resultadosSuites = [];
    try {
        for (const enlace of enlaces) {
            const suite = enlace.textContent;
            resumen.textContent = `Ejecutando ${suite}…`;
            const detalle = enlace.parentElement.querySelector('output') ?? document.createElement('output');
            enlace.after(detalle);
            try {
                const resultado = await ejecutarSuite(enlace);
                window.resultadosSuites.push({ suite, ...resultado });
                detalle.textContent = ` — ${resultado.aprobadas} aprobadas, ${resultado.fallidas} fallidas, ${resultado.pendientes} pendientes`;
            } catch (error) {
                window.resultadosSuites.push({ suite, error: error.message });
                detalle.textContent = ` — ${error.message}`;
            }
        }
        const fallos = window.resultadosSuites.filter(resultado => resultado.error || resultado.fallidas);
        resumen.textContent = `${enlaces.length} suites ejecutadas, ${fallos.length} con errores`;
    } finally {
        boton.disabled = false;
    }
});
