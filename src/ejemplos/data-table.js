import { DataTable } from '../js/boundary/componentes/data-display/index.js';

const patients = [
    { id: 1, name: 'Juan Pérez', age: 35, status: 'Activo', lastVisit: '2026-10-15' },
    { id: 2, name: 'María López', age: 28, status: 'Inactivo', lastVisit: '2026-09-01' },
    { id: 3, name: 'Ana García', age: 42, status: 'Activo', lastVisit: '2026-11-02' },
    { id: 4, name: 'José Hernández', age: null, status: 'Activo', lastVisit: null },
    { id: 5, name: 'Carlos Rivera', age: 60, status: 'Activo', lastVisit: '2026-08-04' },
    { id: 6, name: 'Sofía Martínez', age: 19, status: 'Inactivo', lastVisit: '2026-10-25' }
];
const feedback = document.querySelector('#feedback');
const table = new DataTable('#patientsTable', {
    title: 'Pacientes', data: patients,
    columns: [
        { key: 'id', label: 'ID', type: 'number', sortable: true, searchable: false },
        { key: 'name', label: 'Paciente', sortable: true, width: '220px' },
        { key: 'age', label: 'Edad', type: 'number', sortable: true, align: 'right', formatter: value => value ?? 'Sin dato' },
        { key: 'status', label: 'Estado', sortable: true, renderCell: value => {
            const span = document.createElement('strong'); span.textContent = value; return span;
        } },
        { key: 'lastVisit', label: 'Última visita', type: 'date', sortable: true, formatter: value => value ?? 'Sin visitas' }
    ],
    selectable: true, rowKey: 'id', pageSize: 5,
    actions: [
        { label: 'Ver', onClick: row => { feedback.textContent = `Paciente: ${row.name}`; } },
        { label: 'Editar', disabled: row => row.status === 'Inactivo', onClick: row => { feedback.textContent = `Editar: ${row.name}`; } }
    ]
}).render();
const specialties = new DataTable('#specialtiesTable', {
    title: 'Especialidades', columns: [{ key: 'name', label: 'Especialidad' }],
    data: [{ name: 'Medicina general' }, { name: 'Pediatría' }],
    searchable: false, pagination: false
}).render();
document.querySelector('#selected').addEventListener('click', () => {
    feedback.textContent = `Seleccionados: ${table.getSelectedRows().map(row => row.name).join(', ') || 'ninguno'}`;
});
document.querySelector('#update').addEventListener('click', () => table.update([
    ...patients, { id: 7, name: 'Lucía Flores', age: 24, status: 'Activo', lastVisit: '2026-11-05' }
]));

// Integración externa: no se invoca automáticamente ni presupone una ruta existente.
// Contrato esperado: arreglo de pacientes con los campos de las columnas anteriores.
export async function loadPatients(endpoint, signal) {
    table.setError(null).setLoading(true);
    try {
        const response = await fetch(endpoint, { signal });
        if (!response.ok) throw new Error('Error al cargar pacientes');
        table.update(await response.json());
    } catch (error) {
        table.setError(error.message);
    } finally {
        table.setLoading(false);
    }
}
// loadPatients('/ruta-real-del-backend');
window.addEventListener('pagehide', event => {
    if (!event.persisted) { table.destroy(); specialties.destroy(); }
});
