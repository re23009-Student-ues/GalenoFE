import { ticketPDF, fechaAgenda } from '../../control/agenda_service.js';
import './tarjeta_simple.js';

class TarjetaCita extends HTMLElement {
    connectedCallback() {
        this.version = (this.version || 0) + 1;
        const c = this.cita;
        const tarjeta = document.createElement('tarjeta-simple');
        const titulo = document.createElement('span');
        titulo.slot = 'titulo';
        titulo.textContent = fechaAgenda(c.fechaInicio);

        const contenido = document.createElement('div');
        contenido.slot = 'contenido';
        const clinica = document.createElement('p');
        const etiquetaClinica = document.createElement('strong');
        etiquetaClinica.textContent = 'Clínica:';
        clinica.append(etiquetaClinica, ` ${c.idPersonaRol?.idClinica?.nombre || 'Clínica sin nombre'}`);
        const procedimientos = document.createElement('p');
        const nombres = c.procedimientos.map(p => p.idProcedimiento?.nombre || 'Procedimiento sin nombre').join(', ');
        procedimientos.textContent = `Procedimientos: ${nombres || 'Sin procedimientos registrados'}`;
        contenido.append(clinica, procedimientos);

        const pie = document.createElement('div');
        pie.slot = 'pie';
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.textContent = 'Descargar consulta PDF';
        const aviso = document.createElement('p');
        aviso.setAttribute('role', 'status');
        aviso.setAttribute('aria-live', 'polite');
        pie.append(boton, aviso);

        tarjeta.append(titulo, contenido, pie);
        this.replaceChildren(tarjeta);
        this.alDescargar = () => this.descargar();
        boton.addEventListener('click', this.alDescargar);
    }
    disconnectedCallback() { this.version++; this.querySelector('button')?.removeEventListener('click', this.alDescargar); }
    async descargar() {
        const boton = this.querySelector('button');
        if (boton.disabled) return;
        boton.disabled = true;
        const version = this.version;
        const aviso = this.querySelector('[role="status"]');
        aviso.textContent = 'Descargando consulta…';
        try {
            const blob = await ticketPDF(this.cita.idConsulta);
            if (!this.isConnected || version !== this.version) return;
            const url = URL.createObjectURL(blob);
            const enlace = document.createElement('a');
            enlace.href = url;
            enlace.download = `consulta-${this.cita.idConsulta}.pdf`;
            this.append(enlace);
            try {
                enlace.click();
                aviso.textContent = 'Consulta descargada';
                this.dispatchEvent(new CustomEvent('galeno-consulta-descargada', { bubbles: true }));
            }
            finally { enlace.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
        } catch (e) { if (this.isConnected && version === this.version) aviso.textContent = e.message || 'No se pudo descargar la consulta'; }
        finally { if (this.isConnected && version === this.version) boton.disabled = false; }
    }
}
customElements.define('galeno-tarjeta-cita', TarjetaCita);
