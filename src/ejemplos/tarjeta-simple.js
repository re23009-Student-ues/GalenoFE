import '../js/boundary/componentes/tarjeta_simple.js';

document.querySelector('#tarjeta-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const tarjeta = document.querySelector('#tarjeta-editable');
    tarjeta.querySelector('[slot=titulo]').textContent = data.get('title');
    tarjeta.querySelector('[slot=contenido]').textContent = data.get('content');
    document.querySelector('#tarjeta-feedback').textContent = 'Se actualizó la primera tarjeta sin recrear el componente.';
});
