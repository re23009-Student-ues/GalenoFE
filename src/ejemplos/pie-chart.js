import { PieChart } from '../js/boundary/componentes/charts/index.js';

const chart = new PieChart('#appointmentsChart', {
    title: 'Estado de las citas',
    data: [
        { label: 'Completadas', value: 120 },
        { label: 'Pendientes', value: 45 },
        { label: 'Canceladas', value: 15 }
    ],
    colors: ['#15803d', '#2563eb', '#b91c1c'],
    showLegend: true, showLabels: true, showPercentages: true
}).render();
const specialties = new PieChart('#specialtiesChart', {
    title: 'Pacientes por especialidad',
    data: [{ label: 'Medicina general', value: 65 }, { label: 'Pediatría', value: 35 }]
}).render();
const updateButton = document.querySelector('#update');
updateButton.addEventListener('click', () => chart.update([
    { label: 'Completadas', value: 100 },
    { label: 'Pendientes', value: 30 },
    { label: 'Canceladas', value: 15 }
]));
document.querySelector('#destroy').addEventListener('click', () => {
    chart.destroy(); specialties.destroy(); updateButton.disabled = true;
});

// Adaptador externo: no se invoca automáticamente ni presupone un endpoint existente.
// Contrato esperado: [{ label: 'Completadas', value: 120 }, ...].
export async function loadStatistics(endpoint, signal) {
    const response = await fetch(endpoint, { signal });
    if (!response.ok) throw new Error(`Error al obtener estadísticas (${response.status}).`);
    chart.update(await response.json());
}
// loadStatistics('/ruta-real-del-backend').catch(console.error);
// En una SPA, destruir las instancias al abandonar la vista.
window.addEventListener('pagehide', event => {
    if (!event.persisted) { chart.destroy(); specialties.destroy(); }
});
