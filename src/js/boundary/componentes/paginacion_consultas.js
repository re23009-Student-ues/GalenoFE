const CONSULTAS_POR_PAGINA = 4;

export function crearPaginacionConsultas(renderizar) {
    const nav = document.createElement('nav');
    nav.className = 'agenda-panel consultas-paginacion';
    nav.setAttribute('aria-label', 'Paginación de consultas');

    const anterior = document.createElement('button');
    anterior.type = 'button';
    anterior.textContent = 'Anterior';
    const siguiente = document.createElement('button');
    siguiente.type = 'button';
    siguiente.textContent = 'Siguiente';
    const estado = document.createElement('span');
    estado.setAttribute('aria-live', 'polite');
    estado.tabIndex = -1;
    nav.append(anterior, estado, siguiente);

    let consultas = [];
    let pagina = 1;
    function pintar() {
        const total = Math.ceil(consultas.length / CONSULTAS_POR_PAGINA);
        const inicio = (pagina - 1) * CONSULTAS_POR_PAGINA;
        nav.hidden = total <= 1;
        anterior.disabled = pagina <= 1;
        siguiente.disabled = pagina >= total;
        estado.textContent = total > 1 ? `Página ${pagina} de ${total}` : '';
        renderizar(consultas.slice(inicio, inicio + CONSULTAS_POR_PAGINA));
    }

    function cambiarPagina(boton, incremento) {
        if (boton.disabled) return;
        pagina += incremento;
        pintar();
        if (boton.disabled) estado.focus();
    }

    anterior.addEventListener('click', () => cambiarPagina(anterior, -1));
    siguiente.addEventListener('click', () => cambiarPagina(siguiente, 1));
    nav.hidden = true;
    return {
        nav,
        mostrar(resultados) {
            consultas = resultados;
            pagina = 1;
            pintar();
        }
    };
}
