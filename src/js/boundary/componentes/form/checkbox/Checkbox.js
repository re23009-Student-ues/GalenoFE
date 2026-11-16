let sequence = 0;
const reserved = new Set();

class GalenoCheckbox extends HTMLElement {
    connectedCallback() { this.field?.connect(); }
    disconnectedCallback() { this.field?.disconnect(); }
}
customElements.define('galeno-checkbox', GalenoCheckbox);

/** Fachada de un checkbox nativo en DOM ligero, como TextArea. */
export default class Checkbox {
    constructor(target, options = {}) {
        this.target = typeof target === 'string' ? document.querySelector(target) : target;
        if (!(this.target instanceof HTMLElement) || this.target instanceof HTMLInputElement) throw new TypeError('Checkbox: contenedor inexistente o inválido.');
        if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Checkbox: opciones inválidas.');
        this.options = { name: '', label: '', value: 'on', checked: false, disabled: false, required: false, ...options };
        const o = this.options;
        if (['name', 'label', 'value'].some(key => typeof o[key] !== 'string') ||
            ['checked', 'disabled', 'required'].some(key => typeof o[key] !== 'boolean') ||
            (o.id !== undefined && (typeof o.id !== 'string' || !o.id || /\s/.test(o.id))) ||
            (o.onChange !== undefined && typeof o.onChange !== 'function')) throw new TypeError('Checkbox: configuración inválida.');
        const unavailable = id => reserved.has(id) || reserved.has(`${id}-error`) || document.getElementById(id) || document.getElementById(`${id}-error`);
        if (o.id !== undefined && unavailable(o.id)) throw new TypeError('Checkbox: id duplicado.');
        this.id = o.id;
        if (!this.id) do { this.id = `galeno-checkbox-${++sequence}`; } while (unavailable(this.id));
        reserved.add(this.id); reserved.add(`${this.id}-error`);
        this.control = document.createElement('input');
        Object.assign(this.control, { type: 'checkbox', id: this.id, name: o.name, value: o.value,
            defaultChecked: o.checked, checked: o.checked, disabled: o.disabled, required: o.required });
        this.manualError = ''; this.touched = false; this.destroyed = false;
    }

    render() {
        if (this.destroyed || this.root) return this;
        this.root = document.createElement('galeno-checkbox'); this.root.field = this;
        this.control.className = 'checkbox__control';
        this.label = document.createElement('label'); this.label.className = 'checkbox__label'; this.label.htmlFor = this.id;
        const text = document.createElement('span'); text.textContent = this.options.label || this.options.name || 'Seleccionar';
        this.label.append(this.control, text);
        this.error = document.createElement('p'); this.error.className = 'checkbox__error';
        this.error.id = `${this.id}-error`; this.error.setAttribute('role', 'alert');
        this.root.append(this.label, this.error);
        this.onChange = () => {
            if (this.control.matches(':disabled')) return;
            this.manualError = ''; this.touched = true; this.refresh();
            const checked = this.getChecked(), value = this.getValue();
            this.root.dispatchEvent(new CustomEvent('galeno-checkbox-change', { bubbles: true, composed: true, detail: { checked, value } }));
            this.options.onChange?.(checked, value);
        };
        this.onInvalid = () => { this.touched = true; this.refresh(); };
        this.onReset = event => {
            clearTimeout(this.resetTimer);
            this.resetTimer = setTimeout(() => {
                this.resetTimer = null;
                if (!this.destroyed && !event.defaultPrevented) { this.manualError = ''; this.touched = false; this.refresh(); }
            }, 0);
        };
        this.control.addEventListener('change', this.onChange);
        this.control.addEventListener('invalid', this.onInvalid);
        this.target.append(this.root); this.refresh();
        return this;
    }
    connect() {
        if (this.destroyed || !this.root) return;
        this.disconnect(); this.form = this.control.form;
        this.form?.addEventListener('reset', this.onReset);
        this.refresh();
    }
    disconnect() {
        this.form?.removeEventListener('reset', this.onReset); this.form = null;
        clearTimeout(this.resetTimer); this.resetTimer = null;
    }
    refresh() {
        if (!this.root || this.destroyed) return this;
        this.control.setCustomValidity('');
        const message = this.control.willValidate ? this.manualError || (this.control.required && !this.control.checked ? 'Selecciona esta opción.' : '') : '';
        this.control.setCustomValidity(message); this.validityMessage = message;
        const visible = this.touched ? message : '';
        this.error.textContent = visible;
        this.control.setAttribute('aria-invalid', String(!!visible));
        if (visible) this.control.setAttribute('aria-describedby', this.error.id);
        else this.control.removeAttribute('aria-describedby');
        return this;
    }
    getChecked() { return this.control ? this.control.checked : this.checked; }
    getValue() { return this.control ? this.control.value : this.value; }
    setChecked(checked) {
        if (typeof checked !== 'boolean') throw new TypeError('Checkbox: checked debe ser booleano.');
        if (!this.destroyed) { this.control.checked = checked; this.manualError = ''; this.refresh(); }
        return this;
    }
    setDisabled(disabled) {
        if (typeof disabled !== 'boolean') throw new TypeError('Checkbox: disabled debe ser booleano.');
        if (!this.destroyed) { this.control.disabled = disabled; this.refresh(); }
        return this;
    }
    setError(message) {
        if (typeof message !== 'string') throw new TypeError('Checkbox: el error debe ser texto.');
        if (!this.destroyed) { this.manualError = message; this.touched = !!message; this.render(); this.refresh(); }
        return this;
    }
    clearError() {
        if (!this.destroyed) { this.manualError = ''; this.touched = false; this.refresh(); }
        return this;
    }
    validate() {
        if (this.destroyed) return { valid: false, message: 'El control fue destruido.' };
        this.render(); this.touched = true; this.refresh();
        return { valid: !this.validityMessage, message: this.validityMessage };
    }
    focus() { if (!this.destroyed) this.control.focus(); return this; }
    destroy() {
        if (this.destroyed) return;
        this.checked = this.getChecked(); this.value = this.getValue(); this.destroyed = true; this.disconnect();
        if (this.onChange) this.control.removeEventListener('change', this.onChange);
        if (this.onInvalid) this.control.removeEventListener('invalid', this.onInvalid);
        if (this.root) { this.root.field = null; this.root.remove(); }
        reserved.delete(this.id); reserved.delete(`${this.id}-error`);
        this.options = {}; this.target = this.control = this.root = this.label = this.error = null;
        this.onChange = this.onInvalid = this.onReset = null;
    }
}
