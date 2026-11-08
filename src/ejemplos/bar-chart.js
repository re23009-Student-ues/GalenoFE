import { BarChart } from '../js/boundary/componentes/charts/index.js';

const patients = [
    { label: 'Lunes', value: 35 },
    { label: 'Martes', value: 48 },
    { label: 'Miércoles', value: 42 },
    { label: 'Jueves', value: 60 },
    { label: 'Viernes', value: 52 }
];
const chart = new BarChart('#patientsChart', {
    data: patients, title: 'Pacientes atendidos', orientation: 'vertical',
    height: 320, colors: ['#2563eb'], showGrid: true, showValues: true,
    animated: true, responsive: true, showDataTable: true
}).render();
const horizontal = new BarChart('#patientsHorizontal', {
    data: patients, title: 'Pacientes por día', orientation: 'horizontal'
}).render();
document.querySelector('#update').addEventListener('click', () => {
    chart.update(patients.map(item => ({ ...item, value: item.value + 5 })));
});

// Lógica de integración: solo se ejecuta cuando el consumidor la invoca.
// El endpoint debe devolver [{ label: 'Lunes', value: 35 }, ...].
export async function actualizarDesdeAPI(endpoint, signal) {
    const response = await fetch(endpoint, { signal });
    if (!response.ok) throw new Error(`No se pudieron cargar los pacientes (${response.status}).`);
    const data = await response.json();
    chart.update(data);
}
// Ejemplo: actualizarDesdeAPI('/ruta-real-del-backend').catch(console.error);
// En un controlador de la SPA, llamar destroy() al abandonar la vista.
window.addEventListener('pagehide', event => {
    if (!event.persisted) { chart.destroy(); horizontal.destroy(); }
});
