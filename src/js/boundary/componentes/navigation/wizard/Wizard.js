let sequence = 0;
const defaults = { steps: [], linear: true, showProgress: true, showStepNumbers: true,
    allowBackNavigation: true, previousText: 'Anterior', nextText: 'Siguiente',
    finishText: 'Finalizar', loadingText: 'Procesando…', data: {} };
const labels = { initial: 'Inicial', 'in-progress': 'En progreso', validating: 'Validando…',
    'validation-error': 'Error de validación', completing: 'Finalizando…',
    'completion-error': 'Error al finalizar', completed: 'Proceso completado' };

class GalenoWizard extends HTMLElement {}
customElements.define('galeno-wizard', GalenoWizard);

function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function copyData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(data))) throw new TypeError('Wizard: data debe ser un objeto plano.');
    try { return structuredClone(data); }
    catch { throw new TypeError('Wizard: data debe contener valores clonables, sin funciones ni nodos DOM.'); }
}

/** Coordina pasos y validaciones. No serializa controles, persiste datos ni realiza peticiones. */
export default class Wizard {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!(this.container instanceof HTMLElement)) throw new TypeError('Wizard: contenedor inexistente.');
        if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Wizard: opciones inválidas.');
        this.options = { ...defaults, ...options };
        const o = this.options;
        if (['linear', 'showProgress', 'showStepNumbers', 'allowBackNavigation'].some(key => typeof o[key] !== 'boolean') ||
            ['previousText', 'nextText', 'finishText', 'loadingText'].some(key => typeof o[key] !== 'string' || !o[key].trim()) ||
            ['onStepChange', 'onComplete'].some(key => o[key] !== undefined && typeof o[key] !== 'function') ||
            !Array.isArray(o.steps) || !o.steps.length) throw new TypeError('Wizard: configuración inválida.');
        const ids = new Set(), contents = [];
        this.steps = o.steps.map(step => {
            if (!step || typeof step.id !== 'string' || !step.id.trim() || ids.has(step.id) ||
                typeof step.title !== 'string' || !step.title.trim() ||
                (step.description !== undefined && typeof step.description !== 'string') ||
                (step.validate !== undefined && typeof step.validate !== 'function') ||
                ['enabled', 'optional'].some(key => step[key] !== undefined && typeof step[key] !== 'boolean') ||
                !(step.content instanceof Node) || ![1, 3, 11].includes(step.content.nodeType) ||
                step.content === this.container || step.content.contains(this.container) ||
                contents.some(node => node.contains(step.content) || step.content.contains(node))) {
                throw new TypeError('Wizard: cada paso requiere id único, título y un nodo DOM independiente.');
            }
            ids.add(step.id); contents.push(step.content);
            return { ...step, description: step.description ?? '', enabled: step.enabled ?? true,
                optional: step.optional ?? false, completed: false, error: false, version: 0 };
        });
        if (!this.steps.some(step => step.enabled)) throw new TypeError('Wizard: debe existir un paso habilitado.');
        this.initialData = copyData(o.data);
        this.data = copyData(this.initialData);
        this.current = this.steps.findIndex(step => step.enabled);
        this.id = `wizard-${++sequence}`;
        this.state = 'initial'; this.operation = false; this.externalLoading = false;
        this.destroyed = false; this.token = 0; this.dataVersion = 0; this.owned = [];
    }

    render() {
        if (this.destroyed) return this;
        if (!this.root) this.mount();
        this.update();
        return this;
    }

    mount() {
        this.root = document.createElement('galeno-wizard'); this.root.className = 'wizard';
        this.root.setAttribute('aria-label', 'Formulario por pasos');
        this.header = element('header', 'wizard__header');
        const navigation = element('nav', 'wizard__navigation'); navigation.setAttribute('aria-label', 'Pasos del formulario');
        this.indicator = element('ol', 'wizard__steps'); navigation.append(this.indicator);
        this.progress = element('progress', 'wizard__progress'); this.progress.max = this.enabled().length;
        this.progress.setAttribute('aria-label', 'Pasos completados'); this.progress.hidden = !this.options.showProgress;
        this.status = element('p', 'wizard__status'); this.status.setAttribute('role', 'status');
        this.header.append(navigation, this.progress, this.status);
        this.content = element('div', 'wizard__content');
        this.steps.forEach((step, index) => {
            const item = element('li', 'wizard__step');
            const button = element('button', 'wizard__step-button'); button.type = 'button'; button.dataset.step = step.id;
            const number = element('span', 'wizard__step-number'); number.setAttribute('aria-hidden', 'true');
            const info = element('span', 'wizard__step-info');
            const title = element('span', 'wizard__step-title', step.title);
            title.id = `${this.id}-title-${index}`;
            const description = element('span', 'wizard__step-description', step.description); description.hidden = !step.description;
            const state = element('span', 'wizard__step-state');
            info.append(title, description, state); button.append(number, info); item.append(button); this.indicator.append(item);
            const panel = element('section', 'wizard__panel'); panel.id = `${this.id}-panel-${index}`;
            panel.setAttribute('aria-labelledby', `${this.id}-heading-${index}`);
            button.setAttribute('aria-controls', panel.id);
            const heading = element('h3', 'wizard__panel-title', step.title); heading.id = `${this.id}-heading-${index}`; heading.tabIndex = -1;
            panel.append(heading);
            const nodes = step.content.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? [...step.content.childNodes] : [step.content];
            for (const child of nodes) {
                const marker = child.parentNode ? document.createComment('wizard: ubicación original') : null;
                if (marker) child.before(marker);
                this.owned.push({ child, marker }); panel.append(child);
            }
            this.content.append(panel);
            Object.assign(step, { item, button, number, stateLabel: state, panel, heading });
        });
        this.error = element('p', 'wizard__error'); this.error.setAttribute('role', 'alert'); this.error.tabIndex = -1;
        this.loading = element('p', 'wizard__loading', this.options.loadingText); this.loading.hidden = true;
        this.loading.setAttribute('aria-hidden', 'true');
        this.footer = element('footer', 'wizard__footer');
        const actions = element('div', 'wizard__actions');
        this.back = element('button', 'wizard__previous', this.options.previousText); this.back.type = 'button';
        this.forward = element('button', 'wizard__next', this.options.nextText); this.forward.type = 'button';
        actions.append(this.back, this.forward); this.footer.append(this.loading, actions);
        this.root.append(this.header, this.content, this.error, this.footer);
        this.onClick = event => {
            const button = event.target.closest('button');
            if (button === this.back) void this.previous();
            else if (button === this.forward) void this.next();
            else if (button?.parentNode?.parentNode === this.indicator) void this.goToStep(button.dataset.step);
        };
        this.onEdit = event => {
            if (this.state === 'completed') return;
            const step = this.steps.find(item => item.panel.contains(event.target));
            if (!step) return;
            step.version++; step.completed = false; step.error = false;
            if (!this.busy() && this.state !== 'completed') {
                this.state = 'in-progress'; this.clearError();
            }
            this.update();
        };
        this.onSubmit = event => {
            if (!event.defaultPrevented && this.steps[this.current].panel.contains(event.target)) {
                event.preventDefault(); void this.next();
            }
        };
        this.root.addEventListener('click', this.onClick);
        this.root.addEventListener('input', this.onEdit);
        this.root.addEventListener('change', this.onEdit);
        this.root.addEventListener('submit', this.onSubmit);
        this.container.append(this.root);
    }

    enabled() { return this.steps.map((step, index) => step.enabled ? index : -1).filter(index => index !== -1); }
    busy() { return this.operation || this.externalLoading; }
    available() { return !this.destroyed && !!this.root && !this.busy() && this.state !== 'completed'; }

    canGo(index) {
        if (!this.steps[index]?.enabled || index === this.current) return false;
        if (index < this.current) return this.options.allowBackNavigation;
        return !this.options.linear || this.steps.slice(this.current + 1, index).every(step => !step.enabled || step.completed);
    }

    update() {
        if (!this.root || this.destroyed) return;
        const busy = this.busy(), done = this.state === 'completed';
        this.root.dataset.state = this.state; this.root.setAttribute('aria-busy', String(busy));
        this.steps.forEach((step, index) => {
            const active = index === this.current;
            step.panel.hidden = !active;
            step.item.className = `wizard__step${active ? ' wizard__step--active' : ''}${step.completed ? ' wizard__step--completed' : ''}${step.error ? ' wizard__step--error' : ''}`;
            step.item.hidden = !step.enabled;
            step.button.disabled = busy || done || !this.canGo(index);
            if (active) step.button.setAttribute('aria-current', 'step'); else step.button.removeAttribute('aria-current');
            step.number.textContent = step.error ? '!' : step.completed ? '✓' : this.options.showStepNumbers ? String(this.enabled().indexOf(index) + 1) : '•';
            step.stateLabel.textContent = [active ? 'Actual' : '', step.error ? 'Error' : step.completed ? 'Completado' : !active ? 'Pendiente' : ''].filter(Boolean).join(' · ');
        });
        this.progress.value = this.steps.filter(step => step.enabled && step.completed).length;
        const statusText = `${labels[this.state]} · Paso ${this.enabled().indexOf(this.current) + 1} de ${this.enabled().length}`;
        const announcement = this.externalLoading && !this.operation ? `${this.options.loadingText} ${statusText}` : statusText;
        if (this.status.textContent !== announcement) this.status.textContent = announcement;
        this.loading.hidden = !busy;
        this.back.disabled = busy || done || !this.options.allowBackNavigation || this.current === this.enabled()[0];
        this.forward.disabled = busy || done;
        this.forward.textContent = this.current === this.enabled().at(-1) ? this.options.finishText : this.options.nextText;
    }

    metadata(index) {
        const step = this.steps[index];
        return { id: step.id, title: step.title, description: step.description, index,
            enabled: step.enabled, optional: step.optional, active: index === this.current,
            completed: step.completed, status: step.error ? 'error' : index === this.current ? 'current' : step.completed ? 'completed' : 'pending' };
    }
    getCurrentStep() { return this.metadata(this.current); }
    getSteps() { return this.steps.map((_, index) => this.metadata(index)); }
    getData() { return copyData(this.data); }
    setData(data) {
        const next = copyData(data);
        if (!this.destroyed && this.state !== 'completed') {
            this.data = { ...this.data, ...next }; this.dataVersion++;
            this.steps.forEach(step => { step.completed = false; });
            this.update();
        }
        return this;
    }

    async next() {
        if (!this.available()) return false;
        const enabled = this.enabled(), position = enabled.indexOf(this.current);
        return this.run(enabled[position + 1], position === enabled.length - 1);
    }
    async previous() {
        if (!this.available() || !this.options.allowBackNavigation) return false;
        const enabled = this.enabled(), position = enabled.indexOf(this.current);
        if (!position) return false;
        return this.goToStep(this.steps[enabled[position - 1]].id);
    }
    async goToStep(id) {
        if (!this.available()) return false;
        const index = this.steps.findIndex(step => step.id === id);
        if (!this.canGo(index)) return false;
        if (index < this.current) { this.clearError(); this.state = 'in-progress'; this.activate(index); return !this.destroyed; }
        return this.run(index, false);
    }

    async check(index, token) {
        const step = this.steps[index], version = step.version, dataVersion = this.dataVersion;
        try {
            const result = step.validate ? await step.validate(this.getData(), this.metadata(index)) : true;
            if (this.destroyed || token !== this.token) return null;
            if (version !== step.version || dataVersion !== this.dataVersion) return { valid: false, message: 'Los datos cambiaron durante la validación. Revisa e intenta nuevamente.' };
            if (result === true) return { valid: true };
            if (result === false) return { valid: false, message: 'Completa los campos requeridos para continuar.' };
            if (result && typeof result.valid === 'boolean') return { valid: result.valid,
                message: typeof result.message === 'string' && result.message.trim() ? result.message : 'Revisa los datos de este paso.' };
        } catch { /* Nunca mostrar mensajes técnicos de excepciones externas. */ }
        return { valid: false, message: 'No fue posible validar este paso. Intenta nuevamente.' };
    }

    async run(target, finish) {
        this.operation = true; const token = ++this.token;
        const versions = this.steps.map(step => step.version), dataVersion = this.dataVersion;
        this.state = 'validating'; this.clearError(); this.update();
        try {
            const indices = [this.current];
            // Un salto no lineal tampoco omite las validaciones obligatorias intermedias.
            if (!finish && !this.options.linear) indices.push(...this.enabled().filter(index =>
                index > this.current && index < target && !this.steps[index].optional));
            if (finish) indices.push(...this.enabled().filter(index => index !== this.current && !this.steps[index].optional));
            for (const index of indices) {
                const result = await this.check(index, token);
                if (!result || this.destroyed || token !== this.token) return false;
                if (!result.valid) {
                    return this.fail(index, result.message, finish);
                }
            }
            if (dataVersion !== this.dataVersion || indices.some(index => versions[index] !== this.steps[index].version)) {
                return this.fail(this.current, 'Los datos cambiaron durante la validación. Revisa e intenta nuevamente.', false);
            }
            indices.forEach(index => { this.steps[index].error = false; });
            if (finish) {
                this.state = 'completing'; this.update();
                const version = this.dataVersion;
                const result = await this.options.onComplete?.(this.getData());
                if (this.destroyed || token !== this.token) return false;
                if (result === false || version !== this.dataVersion) throw new Error('Finalización no confirmada');
                indices.forEach(index => { this.steps[index].completed = true; this.steps[index].error = false; });
                this.state = 'completed';
            } else {
                indices.forEach(index => { this.steps[index].completed = true; this.steps[index].error = false; });
                this.state = 'in-progress'; this.activate(target);
            }
            return !this.destroyed;
        } catch {
            if (!this.destroyed && token === this.token) {
                this.state = 'completion-error'; this.error.dataset.kind = 'completion';
                this.error.textContent = 'No fue posible finalizar el proceso. Tus datos se conservan. Intenta nuevamente.';
                this.error.focus();
            }
            return false;
        } finally {
            if (!this.destroyed && token === this.token) { this.operation = false; this.update(); }
        }
    }

    fail(index, message, finish) {
        const failed = finish ? index : this.current;
        this.steps[failed].error = true; this.steps[failed].completed = false;
        this.state = 'validation-error';
        if (finish && index !== this.current) this.activate(index);
        if (this.destroyed) return false;
        this.error.dataset.kind = 'validation'; this.error.textContent = index === this.current ? message :
            `Revisa el paso «${this.steps[index].title}». ${message}`;
        this.error.focus();
        return false;
    }

    activate(index) {
        const previous = this.getCurrentStep();
        this.current = index; this.update();
        this.steps[index].heading.focus();
        try { this.options.onStepChange?.(this.getCurrentStep(), previous); }
        catch {
            if (this.error) {
                this.error.dataset.kind = 'callback'; this.error.textContent = 'No fue posible ejecutar el aviso de cambio de paso.';
            }
        }
    }
    clearError() { if (this.error) { this.error.textContent = ''; delete this.error.dataset.kind; } }
    setLoading(loading) {
        if (typeof loading !== 'boolean') throw new TypeError('Wizard: loading debe ser booleano.');
        if (!this.destroyed) { this.externalLoading = loading; this.update(); }
        return this;
    }
    reset() {
        if (this.destroyed || this.busy()) return false;
        this.token++; this.dataVersion++;
        this.data = copyData(this.initialData); this.state = 'initial';
        this.steps.forEach(step => { step.completed = false; step.error = false; step.version++; });
        const target = this.enabled()[0]; this.clearError();
        if (this.root && this.current !== target) this.activate(target);
        else { this.current = target; this.update(); }
        return true;
    }
    destroy() {
        if (this.destroyed) return;
        this.destroyed = true; this.token++;
        if (this.root) {
            this.root.removeEventListener('click', this.onClick);
            this.root.removeEventListener('input', this.onEdit);
            this.root.removeEventListener('change', this.onEdit);
            this.root.removeEventListener('submit', this.onSubmit);
        }
        for (const { child, marker } of this.owned) {
            if (marker?.parentNode) marker.replaceWith(child); else child.remove();
        }
        this.owned.length = 0; this.root?.remove();
        this.steps.forEach(step => {
            step.content = step.validate = step.item = step.button = step.number = step.stateLabel = step.panel = step.heading = null;
        });
        this.options = {}; this.data = {}; this.initialData = {};
        this.root = this.container = this.header = this.indicator = this.progress = this.status = this.content = this.error = this.loading = this.footer = this.back = this.forward = null;
        this.onClick = this.onEdit = this.onSubmit = null;
    }
}
