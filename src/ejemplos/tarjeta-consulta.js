import TarjetaConsulta from '../js/boundary/componentes/tarjeta_consulta.js';

// Datos exclusivos de esta demostración. No se utilizan en las pantallas reales.
const ahora = Date.now();
const hora = 60 * 60 * 1000;
const consultas = [
    { idConsulta: 'demo-programada', fechaInicio: new Date(ahora + 24 * hora).toISOString(), fechaFin: null,
        observaciones: 'Consulta futura de demostración.' },
    { idConsulta: 'demo-actual', fechaInicio: new Date(ahora - hora).toISOString(), fechaFin: null,
        observaciones: 'Consulta en curso de demostración.' },
    { idConsulta: 'demo-fecha-fin', fechaInicio: new Date(ahora - 25 * hora).toISOString(),
        fechaFin: new Date(ahora - 24 * hora).toISOString(), observaciones: '' }
];
consultas.forEach(consulta => {
    const tarjeta = new TarjetaConsulta();
    tarjeta.consulta = { ...consulta, idPersonaRol: {
        idPersona: { nombres: 'Paciente', apellidos: 'Ficticio' },
        idClinica: { nombre: 'Clínica de ejemplo' }
    } };
    document.querySelector('#consultas-demo').append(tarjeta);
});
