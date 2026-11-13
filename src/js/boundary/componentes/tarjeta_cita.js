import { ticketPDF, fechaAgenda, TICKET_PDF_DISPONIBLE } from '../../control/agenda_service.js';
import { esc } from '../util_html.js';
import './tarjeta_simple.js';

class TarjetaCita extends HTMLElement {
    connectedCallback() {
        this.version = (this.version || 0) + 1;
        const c = this.cita;
        this.innerHTML = `<tarjeta-simple><span slot="titulo">${esc(fechaAgenda(c.fechaInicio))}</span><div slot="contenido"><p>${esc(c.idPersonaRol?.idClinica?.nombre || 'Clínica sin nombre')}</p><p>Procedimientos: ${esc(c.procedimientos.map(p => p.idProcedimiento?.nombre || 'Procedimiento sin nombre').join(', ') || 'Sin procedimientos registrados')}</p></div><div slot="pie"><button type="button" ${TICKET_PDF_DISPONIBLE ? '' : 'disabled'}>Descargar ticket PDF</button><p role="status" aria-live="polite">${TICKET_PDF_DISPONIBLE ? '' : 'El ticket PDF todavía no está disponible.'}</p></div></tarjeta-simple>`;
        this.alDescargar = () => this.descargar();
        this.querySelector('button').addEventListener('click', this.alDescargar);
    }
    disconnectedCallback() { this.version++; this.querySelector('button')?.removeEventListener('click', this.alDescargar); }
    async descargar() {
        const boton = this.querySelector('button');
        if (boton.disabled) return;
        boton.disabled = true;
        const version = this.version;
        const aviso = this.querySelector('[role="status"]');
        aviso.textContent = 'Descargando ticket…';
        try {
            const blob = await ticketPDF(this.cita.idConsulta);
            if (!this.isConnected || version !== this.version) return;
            const url = URL.createObjectURL(blob);
            const enlace = document.createElement('a');
            enlace.href = url;
            enlace.download = `ticket-${this.cita.idConsulta}.pdf`;
            this.append(enlace);
            try { enlace.click(); aviso.textContent = 'Ticket descargado'; }
            finally { enlace.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
        } catch (e) { if (this.isConnected && version === this.version) aviso.textContent = e.message || 'No se pudo descargar el ticket'; }
        finally { if (this.isConnected && version === this.version) boton.disabled = false; }
    }
}
customElements.define('galeno-tarjeta-cita', TarjetaCita);
