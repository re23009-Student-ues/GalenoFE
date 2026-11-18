let sequence = 0;

customElements.define('galeno-checkbox', class extends HTMLElement {});

/** Fachada de un checkbox nativo en DOM ligero, como TextArea. */
export default class Checkbox {
    constructor(target, options = {}) {
        this.target = target;
        if (!(this.target instanceof HTMLElement) || this.target instanceof HTMLInputElement) throw new TypeError('Checkbox: contenedor inexistente o inválido.');
        if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Checkbox: opciones inválidas.');
        this.options = { name: '', label: '', value: 'on', checked: false, disabled: false, ...options };
        const o = this.options;
        if (['name', 'label', 'value'].some(key => typeof o[key] !== 'string') ||
            ['checked', 'disabled'].some(key => typeof o[key] !== 'boolean') ||
            (o.onChange !== undefined && typeof o.onChange !== 'function')) throw new TypeError('Checkbox: configuración inválida.');
        do { this.id = `galeno-checkbox-${++sequence}`; } while (document.getElementById(this.id));
        this.control = document.createElement('input');
        Object.assign(this.control, { type: 'checkbox', id: this.id, name: o.name, value: o.value,
            defaultChecked: o.checked, checked: o.checked, disabled: o.disabled });
        this.destroyed = false;
    }

    render() {
        if (this.destroyed || this.root) return this;
        this.root = document.createElement('galeno-checkbox');
        this.control.className = 'checkbox__control';
        this.label = document.createElement('label'); this.label.className = 'checkbox__label'; this.label.htmlFor = this.id;
        const text = document.createElement('span'); text.textContent = this.options.label || this.options.name || 'Seleccionar';
        this.label.append(this.control, text);
        this.root.append(this.label);
        this.onChange = () => {
            if (!this.control.matches(':disabled')) this.options.onChange?.(this.getChecked());
        };
        this.control.addEventListener('change', this.onChange);
        this.target.append(this.root);
        return this;
    }

    getChecked() { return this.control ? this.control.checked : this.checked; }
    setChecked(checked) {
        if (typeof checked !== 'boolean') throw new TypeError('Checkbox: checked debe ser booleano.');
        if (!this.destroyed) { this.control.checked = checked; }
        return this;
    }
    setDisabled(disabled) {
        if (typeof disabled !== 'boolean') throw new TypeError('Checkbox: disabled debe ser booleano.');
        if (!this.destroyed) { this.control.disabled = disabled; }
        return this;
    }
    destroy() {
        if (this.destroyed) return;
        this.checked = this.getChecked();
        this.destroyed = true;
        if (this.onChange) this.control.removeEventListener('change', this.onChange);
        this.root?.remove();
        this.options = {};
        this.target = this.control = this.root = this.label = this.onChange = null;
    }
}
