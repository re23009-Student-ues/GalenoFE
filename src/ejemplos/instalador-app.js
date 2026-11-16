import '../js/boundary/componentes/instalador_app.js';

const feedback = document.querySelector('#install-feedback');
document.querySelector('#offer-install').addEventListener('click', () => {
    const outcome = document.querySelector('#install-outcome').value;
    // Evento sintético exclusivo del ejemplo; nunca se instala una PWA real.
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.userChoice = Promise.resolve({ outcome });
    event.prompt = () => {
        feedback.textContent = outcome === 'accepted' ?
            'Instalación aceptada en la simulación. El botón se ocultará.' :
            'Instalación rechazada en la simulación. Puedes ofrecerla de nuevo.';
    };
    window.dispatchEvent(event);
    feedback.textContent = 'Oferta simulada disponible. Pulsa «Instalar app» para consumirla.';
});
document.querySelector('#installed').addEventListener('click', () => {
    window.dispatchEvent(new Event('appinstalled'));
    feedback.textContent = 'Evento appinstalled simulado: se limpió la oferta y se ocultó el botón.';
});
