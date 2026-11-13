let sequence = 0;
const ownedAttributes = ['id', 'name', 'placeholder', 'rows', 'minlength', 'maxlength', 'required',
    'disabled', 'readonly', 'aria-invalid', 'aria-required', 'aria-describedby', 'aria-labelledby', 'aria-label', 'class', 'style'];

class GalenoTextArea extends HTMLElement {
    connectedCallback() { this.field?.connect(); }
    disconnectedCallback() { this.field?.disconnect(); }
}
customElements.define('galeno-textarea', GalenoTextArea);

function element(tag, className, text) {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/** Campo nativo en DOM ligero: admite un contenedor o un textarea existente. */
export default class TextArea {
    constructor(target, options = {}) {
        this.target = typeof target === 'string' ? document.querySelector(target) : target;
        if (!(this.target instanceof HTMLElement)) throw new TypeError('TextArea: contenedor o textarea inexistente.');
        if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('TextArea: opciones inválidas.');
        this.existing = this.target instanceof HTMLTextAreaElement;
        this.control = this.existing ? this.target : document.createElement('textarea');
        const native = this.control;
        const rows = options.rows ?? (this.existing ? native.rows : 4);
        this.options = { name: native.name, placeholder: native.placeholder, rows, minRows: rows, maxRows: Math.max(rows, 10),
            minLength: native.minLength < 0 ? null : native.minLength, maxLength: native.maxLength < 0 ? null : native.maxLength,
            required: native.required, disabled: native.disabled, readOnly: native.readOnly,
            autoResize: false, showCounter: false, helperText: '', ...options };
        const o = this.options;
        if (['name', 'placeholder', 'helperText'].some(key => typeof o[key] !== 'string') ||
            ['label', 'ariaLabel', 'value'].some(key => o[key] !== undefined && typeof o[key] !== 'string') ||
            ['required', 'disabled', 'readOnly', 'autoResize', 'showCounter'].some(key => typeof o[key] !== 'boolean') ||
            ['rows', 'minRows', 'maxRows'].some(key => !Number.isSafeInteger(o[key]) || o[key] < 1 || o[key] > 2147483647) || o.maxRows < o.minRows ||
            ['minLength', 'maxLength'].some(key => o[key] !== null && (!Number.isSafeInteger(o[key]) || o[key] < 0 || o[key] > 2147483647)) ||
            (o.minLength !== null && o.maxLength !== null && o.minLength > o.maxLength) ||
            ['validator', 'onInput', 'onChange', 'onFocus', 'onBlur'].some(key => o[key] !== undefined && typeof o[key] !== 'function')) {
            throw new TypeError('TextArea: configuración inválida.');
        }
        do { this.id = `galeno-textarea-${++sequence}`; }
        while (['control', 'label', 'helper', 'error'].some(suffix => document.getElementById(`${this.id}-${suffix}`)));
        this.original = Object.fromEntries(ownedAttributes.map(name => [name, native.getAttribute(name)]));
        this.originalDefault = native.defaultValue;
        this.originalValidity = native.validity.customError ? native.validationMessage : '';
        this.describedBy = (native.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        this.value = native.value; this.touched = false; this.destroyed = false;
        this.manualError = this.originalValidity; this.validityMessage = ''; this.resetTimer = null;
        this.resizeFrame = null;
    }

    render() {
        if (this.destroyed) return this;
        if (!this.root) this.mount(); else this.refresh();
        return this;
    }

    mount() {
        const o = this.options, control = this.control;
        this.root = document.createElement('galeno-textarea'); this.root.className = 'textarea'; this.root.field = this;
        const wrappingLabel = this.existing ? control.closest('label') : null;
        this.label = element(wrappingLabel ? 'span' : 'label', 'textarea__label'); this.label.id = `${this.id}-label`;
        const labelText = element('span', '', o.label || '');
        this.required = element('span', 'textarea__required', ' *'); this.required.setAttribute('aria-hidden', 'true');
        this.label.append(labelText, this.required); this.label.hidden = !o.label;
        if (!o.label && control.labels.length) {
            const nativeLabel = control.labels[0];
            if (wrappingLabel) nativeLabel.insertBefore(this.required, nativeLabel.firstChild);
            else nativeLabel.append(this.required);
        }
        if (!control.id) control.id = `${this.id}-control`;
        if (!wrappingLabel) this.label.htmlFor = control.id;
        if (o.label) control.setAttribute('aria-labelledby', this.label.id);
        else if (o.ariaLabel) control.setAttribute('aria-label', o.ariaLabel);
        else if (!control.labels.length && !control.getAttribute('aria-label') && !control.getAttribute('aria-labelledby')) {
            control.setAttribute('aria-label', o.name || 'Texto multilínea');
        }
        control.classList.add('textarea__control');
        control.name = o.name; control.placeholder = o.placeholder; control.rows = o.rows;
        control.required = o.required; control.disabled = o.disabled; control.readOnly = o.readOnly;
        for (const [option, attribute] of [['minLength', 'minlength'], ['maxLength', 'maxlength']]) {
            if (o[option] === null) control.removeAttribute(attribute); else control.setAttribute(attribute, String(o[option]));
        }
        if (o.value !== undefined) { control.defaultValue = o.value; control.value = o.value; }
        this.helper = element('p', 'textarea__helper', o.helperText); this.helper.id = `${this.id}-helper`;
        this.counter = element('span', 'textarea__counter'); this.counter.hidden = !o.showCounter;
        this.error = element('p', 'textarea__error'); this.error.id = `${this.id}-error`; this.error.setAttribute('role', 'alert');
        this.footer = element('div', 'textarea__footer'); this.footer.append(this.helper, this.counter);
        if (this.existing && control.parentNode) {
            this.marker = document.createComment('textarea: ubicación original'); control.before(this.marker, this.root);
        }
        this.root.append(this.label, control, this.footer, this.error);
        this.onInput = event => {
            this.manualError = ''; this.touched = true; this.refresh(); this.options.onInput?.(this.value, event);
        };
        this.onChange = event => {
            this.manualError = ''; this.touched = true; this.refresh(); this.options.onChange?.(this.value, event);
        };
        this.onFocus = event => { this.updateStates(); this.options.onFocus?.(this.getValue(), event); };
        this.onBlur = event => { this.touched = true; this.refresh(); this.options.onBlur?.(this.value, event); };
        this.onInvalid = () => { this.touched = true; this.refresh(); };
        this.onReset = event => {
            clearTimeout(this.resetTimer);
            this.resetTimer = setTimeout(() => {
                this.resetTimer = null;
                if (!this.destroyed && !event.defaultPrevented) { this.touched = false; this.manualError = ''; this.refresh(); }
            }, 0);
        };
        control.addEventListener('input', this.onInput);
        control.addEventListener('change', this.onChange);
        control.addEventListener('focus', this.onFocus);
        control.addEventListener('blur', this.onBlur);
        control.addEventListener('invalid', this.onInvalid);
        if (o.autoResize) {
            this.root.classList.add('textarea--auto');
            if (typeof ResizeObserver !== 'undefined') {
                this.observer = new ResizeObserver(() => {
                    if (this.destroyed || !this.root?.isConnected) return;
                    const style = getComputedStyle(control), width = control.getBoundingClientRect().width;
                    const signature = `${width}|${style.font}|${style.letterSpacing}|${style.padding}|${style.borderWidth}|${style.boxSizing}`;
                    if (this.resizeSignature !== signature) { this.resizeSignature = signature; this.scheduleResize(); }
                });
            } else this.onResize = () => this.scheduleResize();
        }
        if (!this.existing) this.target.append(this.root);
        // En un contenedor conectado, insertar el root pudo ejecutar connectedCallback
        // antes de terminar el montaje. Conectar explícitamente ahora es idempotente.
        if (this.root.isConnected) this.connect(); else this.refresh();
    }

    connect() {
        if (this.destroyed || !this.root || !this.onReset || this.connected) return;
        this.connected = true;
        this.bindForm(); this.observer?.observe(this.control);
        if (this.onResize) window.addEventListener('resize', this.onResize);
        this.refresh();
    }
    disconnect() {
        this.connected = false;
        this.observer?.disconnect(); this.resizeSignature = null;
        if (this.onResize) window.removeEventListener('resize', this.onResize);
        this.form?.removeEventListener('reset', this.onReset); this.form = null;
        clearTimeout(this.resetTimer); this.resetTimer = null;
        if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
        this.resizeFrame = null;
    }
    bindForm() {
        if (this.form === this.control.form) return;
        this.form?.removeEventListener('reset', this.onReset); this.form = this.control.form;
        this.form?.addEventListener('reset', this.onReset);
    }

    refresh() {
        if (!this.root || this.destroyed) return this;
        this.bindForm(); this.value = this.control.value;
        this.helper.hidden = !this.options.helperText;
        this.counter.textContent = this.control.maxLength >= 0 ? `${this.value.length} / ${this.control.maxLength}` : `${this.value.length} caracteres`;
        this.required.hidden = !this.control.required;
        this.evaluate(this.touched); this.updateStates(); this.resize();
        return this;
    }

    evaluate(show) {
        const control = this.control;
        if (!control.validity.customError && this.manualError === this.validityMessage) this.manualError = '';
        if (!this.manualError && control.validity.customError && control.validationMessage !== this.validityMessage) {
            this.manualError = control.validationMessage;
        }
        control.setCustomValidity('');
        let message = '';
        if (control.willValidate) {
            const value = control.value;
            if (this.manualError) message = this.manualError;
            else if (control.required && value.length === 0) message = 'Completa este campo.';
            else if (control.minLength >= 0 && value.length > 0 && value.length < control.minLength) message = `Escribe al menos ${control.minLength} caracteres.`;
            else if (control.maxLength >= 0 && value.length > control.maxLength) message = `No excedas ${control.maxLength} caracteres.`;
            else if (!control.validity.valid) message = control.validationMessage;
            else if (this.options.validator) {
                try {
                    const result = this.options.validator(value);
                    if (result !== true) {
                        if (result && typeof result.then === 'function') Promise.resolve(result).catch(() => {});
                        message = typeof result === 'string' && result.trim() ? result : 'Revisa el contenido de este campo.';
                    }
                } catch { message = 'No fue posible validar este campo. Intenta nuevamente.'; }
            }
        }
        this.validityMessage = message; control.setCustomValidity(message);
        const visible = show ? message : '';
        if (this.error.textContent !== visible) this.error.textContent = visible;
        control.setAttribute('aria-invalid', String(!!visible));
        control.setAttribute('aria-required', String(control.required));
        this.root.classList.toggle('textarea--invalid', !!visible);
        const descriptions = new Set(this.describedBy);
        if (this.options.helperText) descriptions.add(this.helper.id);
        if (visible) descriptions.add(this.error.id);
        if (descriptions.size) control.setAttribute('aria-describedby', [...descriptions].join(' ')); else control.removeAttribute('aria-describedby');
        return { valid: !message, message };
    }

    updateStates() {
        this.root.classList.toggle('textarea--focused', document.activeElement === this.control && !this.control.disabled);
        this.root.classList.toggle('textarea--disabled', this.control.disabled);
        this.root.classList.toggle('textarea--readonly', this.control.readOnly);
        this.root.classList.toggle('textarea--required', this.control.required);
    }

    resize() {
        if (!this.options.autoResize || this.destroyed || !this.control.getBoundingClientRect().width) return;
        const control = this.control, style = getComputedStyle(control);
        const number = value => Number.parseFloat(value) || 0;
        const line = number(style.lineHeight) || number(style.fontSize) * 1.5;
        const padding = number(style.paddingTop) + number(style.paddingBottom);
        const border = number(style.borderTopWidth) + number(style.borderBottomWidth);
        const borderBox = style.boxSizing === 'border-box', extra = padding + border;
        const minimum = line * this.options.minRows + extra, maximum = line * this.options.maxRows + extra;
        const scroll = control.scrollTop;
        control.style.minHeight = `${borderBox ? minimum : minimum - extra}px`;
        control.style.maxHeight = `${borderBox ? maximum : maximum - extra}px`;
        control.style.height = '0px';
        const natural = control.scrollHeight + border;
        const height = Math.max(minimum, Math.min(maximum, natural));
        control.style.height = `${borderBox ? height : height - extra}px`;
        control.style.overflowY = natural > maximum + 1 ? 'auto' : 'hidden';
        if (control.style.overflowY === 'auto') control.scrollTop = scroll;
    }

    scheduleResize() {
        if (this.destroyed || this.resizeFrame !== null) return;
        this.resizeFrame = requestAnimationFrame(() => {
            this.resizeFrame = null;
            if (!this.destroyed && this.root?.isConnected) this.resize();
        });
    }

    getValue() { return this.control ? this.control.value : this.value; }
    setValue(value) {
        if (typeof value !== 'string') throw new TypeError('TextArea: value debe ser texto.');
        if (!this.destroyed) {
            if (!this.root) this.options.value = value;
            this.control.value = value; this.value = this.control.value; this.manualError = '';
            if (this.root) this.refresh();
        }
        return this;
    }
    clear() { return this.setValue(''); }
    focus() { if (!this.destroyed) { this.refresh(); this.control.focus(); } return this; }
    blur() { if (!this.destroyed) this.control.blur(); return this; }
    validate() {
        if (this.destroyed) return { valid: false, message: 'El control fue destruido.' };
        if (!this.root) this.render();
        this.touched = true; this.refresh();
        return { valid: !this.validityMessage, message: this.validityMessage };
    }
    setError(message) {
        if (typeof message !== 'string') throw new TypeError('TextArea: el error debe ser texto.');
        if (!this.destroyed) {
            this.manualError = message; this.touched = !!message;
            if (!this.root) this.render(); else this.refresh();
        }
        return this;
    }
    clearError() {
        if (!this.destroyed) {
            this.manualError = ''; this.touched = false; this.control.setCustomValidity(''); this.validityMessage = ''; this.refresh();
        }
        return this;
    }
    setDisabled(disabled) {
        if (typeof disabled !== 'boolean') throw new TypeError('TextArea: disabled debe ser booleano.');
        if (!this.destroyed) { this.options.disabled = disabled; this.control.disabled = disabled; this.refresh(); }
        return this;
    }
    setReadOnly(readOnly) {
        if (typeof readOnly !== 'boolean') throw new TypeError('TextArea: readOnly debe ser booleano.');
        if (!this.destroyed) { this.options.readOnly = readOnly; this.control.readOnly = readOnly; this.refresh(); }
        return this;
    }
    setHelperText(text) {
        if (typeof text !== 'string') throw new TypeError('TextArea: la ayuda debe ser texto.');
        if (!this.destroyed) { this.options.helperText = text; if (this.helper) this.helper.textContent = text; this.refresh(); }
        return this;
    }
    destroy() {
        if (this.destroyed) return;
        this.value = this.getValue(); this.destroyed = true; this.disconnect();
        const control = this.control;
        for (const [event, handler] of [['input', this.onInput], ['change', this.onChange], ['focus', this.onFocus], ['blur', this.onBlur], ['invalid', this.onInvalid]]) {
            if (handler) control.removeEventListener(event, handler);
        }
        if (this.existing) {
            for (const [name, value] of Object.entries(this.original)) {
                if (value === null) control.removeAttribute(name); else control.setAttribute(name, value);
            }
            control.defaultValue = this.originalDefault; control.value = this.value;
            control.setCustomValidity(this.originalValidity);
        }
        this.required?.remove();
        if (this.root) {
            this.root.field = null;
            if (this.existing) {
                if (this.marker?.parentNode) this.marker.replaceWith(control); else control.remove();
            }
            this.root.remove();
        }
        this.options = {}; this.original = {}; this.describedBy = [];
        this.observer = this.form = this.target = this.control = this.root = this.marker = this.label = this.required = this.helper = this.counter = this.error = this.footer = null;
        this.onInput = this.onChange = this.onFocus = this.onBlur = this.onInvalid = this.onReset = this.onResize = null;
    }
}
