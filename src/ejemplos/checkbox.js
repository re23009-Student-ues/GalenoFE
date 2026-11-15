import { Checkbox } from '../js/boundary/componentes/form/checkbox/index.js';

class CheckboxDemo extends HTMLElement {
    connectedCallback() {
        if (this.fields) return;
        this.innerHTML = `<a href="./index.html">Todos los ejemplos</a><h1>Checkbox</h1>
            <p>Selecciona exámenes opcionales. Demostración local sin envío al servidor.</p>
            <form class="ejemplo__panel"><div class="checkbox-demo__fields"></div>
            <button type="submit">Ver seleccionados</button><button type="reset">Restaurar selección inicial</button></form>
            <pre role="status"></pre>`;
        const examenes = [ { id: '1', nombre: 'Hemograma completo' },
            { id: '2', nombre: 'Examen general de orina' }, { id: '3', nombre: 'Glucosa en sangre' } ];
        const guardados = ['2'];
        this.fields = examenes.map(examen => new Checkbox(this.querySelector('.checkbox-demo__fields'), {
            name: 'examenes', label: examen.nombre, value: examen.id, checked: guardados.includes(examen.id),
            onChange: () => this.showSelection()
        }).render());
        this.submit = event => { event.preventDefault(); this.showSelection(); };
        this.querySelector('form').addEventListener('submit', this.submit);
        this.reset = () => { this.resetTimer = setTimeout(() => this.showSelection(), 0); };
        this.querySelector('form').addEventListener('reset', this.reset);
        this.showSelection();
    }
    showSelection() {
        const values = this.fields.filter(field => field.getChecked()).map(field => field.getValue());
        this.querySelector('pre').textContent = JSON.stringify(values, null, 2);
    }
    disconnectedCallback() {
        clearTimeout(this.resetTimer);
        this.querySelector('form')?.removeEventListener('submit', this.submit);
        this.querySelector('form')?.removeEventListener('reset', this.reset);
        this.fields?.forEach(field => field.destroy()); this.fields = null;
    }
}
customElements.define('galeno-checkbox-demo', CheckboxDemo);
