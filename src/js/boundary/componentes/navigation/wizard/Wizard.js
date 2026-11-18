let sequence = 0;
const loadingText = 'Procesando…';

class GalenoWizard extends HTMLElement {}
customElements.define('galeno-wizard', GalenoWizard);

function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/** Presenta los pasos y comunica las acciones. Atención decide las transiciones. */
export default class Wizard {
    constructor(container, { steps, onSelect, onPrevious, onSave, onNext, onEdit }) {
        if (!(container instanceof HTMLElement) || !Array.isArray(steps) || !steps.length ||
            [onSelect, onPrevious, onSave, onNext, onEdit].some(callback => typeof callback !== 'function')) {
            throw new TypeError('Wizard: configuración inválida.');
        }
        this.container = container;
        this.actions = { onSelect, onPrevious, onSave, onNext, onEdit };
        const ids = new Set(), contents = [];
        this.steps = steps.map(step => {
            if (!step || typeof step.id !== 'string' || !step.id.trim() || ids.has(step.id) ||
                typeof step.title !== 'string' || !step.title.trim() || typeof step.enabled !== 'boolean' ||
                !(step.content instanceof HTMLElement) || step.content.contains(container) ||
                contents.some(node => node.contains(step.content) || step.content.contains(node))) {
                throw new TypeError('Wizard: cada paso requiere id único, título y un elemento DOM independiente.');
            }
            ids.add(step.id); contents.push(step.content);
            const { id, title, content, enabled } = step;
            return { id, title, content, enabled, disabled: true, completed: false, detail: '', status: 'Sin estado' };
        });
        this.current = this.steps.findIndex(step => step.enabled);
        if (this.current < 0) throw new TypeError('Wizard: debe existir un paso visible.');
        this.id = `wizard-${++sequence}`;
        this.state = 'initial';
        this.externalLoading = false;
        this.destroyed = false;
        this.owned = [];
        this.controls = { previous: { disabled: true, title: '' }, saveDisabled: true, next: { disabled: true, text: 'Guardar y avanzar' } };
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
        this.mountCarousel(navigation);
        this.progress = element('progress', 'wizard__progress');
        this.progress.setAttribute('aria-label', 'Pasos completados');
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
            const detail = element('span', 'atencion__paso-responsable');
            const state = element('span', 'wizard__step-state');
            info.append(title, detail, state); button.append(number, info); item.append(button); this.indicator.append(item);
            const panel = element('section', 'wizard__panel'); panel.id = `${this.id}-panel-${index}`;
            panel.setAttribute('aria-labelledby', `${this.id}-heading-${index}`);
            button.setAttribute('aria-controls', panel.id);
            const heading = element('h3', 'wizard__panel-title', step.title); heading.id = `${this.id}-heading-${index}`; heading.tabIndex = -1;
            panel.append(heading);
            const child = step.content;
            const marker = child.parentNode ? document.createComment('wizard: ubicación original') : null;
            if (marker) child.before(marker);
            this.owned.push({ child, marker }); panel.append(child);
            this.content.append(panel);
            Object.assign(step, { item, button, number, detailLabel: detail, stateLabel: state, panel, heading });
        });
        this.loading = element('p', 'wizard__loading', loadingText);
        this.loading.setAttribute('aria-hidden', 'true');
        this.footer = element('footer', 'wizard__footer');
        const actions = element('div', 'wizard__actions');
        this.back = element('button', 'wizard__previous', 'Anterior');
        this.back.setAttribute('aria-label', 'Regresar al paso anterior, reabrirlo y reasignar responsables de ambos pasos');
        this.save = element('button', 'atencion__boton atencion__guardar-paso', 'Guardar');
        this.forward = element('button', 'wizard__next', 'Guardar y avanzar');
        for (const button of [this.back, this.save, this.forward]) button.type = 'button';
        actions.append(this.back, this.save, this.forward);
        this.footer.append(this.loading, actions);
        this.root.append(this.header, this.content, this.footer);
        this.onClick = event => {
            const button = event.target.closest('button');
            if (!button || button.disabled) return;
            if (button === this.carouselPrev) this.scrollIndicator(-1);
            else if (button === this.carouselNext) this.scrollIndicator(1);
            else if (button === this.back) this.actions.onPrevious();
            else if (button === this.save) this.actions.onSave();
            else if (button === this.forward) this.actions.onNext();
            else {
                const step = this.steps.find(step => step.button === button);
                if (step) this.actions.onSelect(step.id);
            }
        };
        this.onEdit = event => {
            if (!this.steps[this.current].panel.contains(event.target)) return;
            this.state = 'in-progress';
            this.actions.onEdit();
            this.update();
        };
        this.onSubmit = event => {
            if (!event.defaultPrevented && this.steps[this.current].panel.contains(event.target)) {
                event.preventDefault();
                if (!this.forward.disabled) this.actions.onNext();
            }
        };
        this.root.addEventListener('click', this.onClick);
        this.root.addEventListener('input', this.onEdit);
        this.root.addEventListener('change', this.onEdit);
        this.root.addEventListener('submit', this.onSubmit);
        this.container.append(this.root);
    }

    mountCarousel(navigation) {
        this.stepsWrapper = element('div', 'wizard__steps-wrapper');
        this.viewport = element('div', 'wizard__steps-viewport');
        this.viewport.id = `${this.id}-steps-viewport`;
        this.viewport.setAttribute('role', 'region');
        this.viewport.setAttribute('aria-label', 'Indicador de pasos; usa las flechas para desplazar');
        this.viewport.tabIndex = -1;
        this.carouselPrev = element('button', 'wizard__carousel-prev', '‹');
        this.carouselNext = element('button', 'wizard__carousel-next', '›');
        for (const [button, label] of [[this.carouselPrev, 'Desplazar pasos hacia la izquierda'], [this.carouselNext, 'Desplazar pasos hacia la derecha']]) {
            button.type = 'button'; button.hidden = true; button.disabled = true;
            button.setAttribute('aria-label', label);
            button.setAttribute('aria-controls', this.viewport.id);
        }
        this.viewport.append(this.indicator);
        this.stepsWrapper.append(this.carouselPrev, this.viewport, this.carouselNext);
        navigation.append(this.stepsWrapper);
        this.onIndicatorScroll = () => this.updateCarouselButtons();
        this.onIndicatorKey = event => {
            if (event.target !== this.viewport || !this.carouselActive || event.altKey || event.ctrlKey || event.metaKey) return;
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                if (event.key === 'Home' || event.key === 'End') {
                    this.scrollIndicatorTo(event.key === 'Home' ? 0 : this.viewport.scrollWidth);
                } else this.scrollIndicator(event.key === 'ArrowLeft' ? -1 : 1);
            }
        };
        this.viewport.addEventListener('scroll', this.onIndicatorScroll, { passive: true });
        this.viewport.addEventListener('keydown', this.onIndicatorKey);
        this.onCarouselResize = () => this.scheduleCarousel(true);
        if (typeof ResizeObserver === 'function') {
            this.carouselObserver = new ResizeObserver(this.onCarouselResize);
            this.carouselObserver.observe(this.stepsWrapper);
        } else window.addEventListener('resize', this.onCarouselResize);
    }

    scheduleCarousel(ensureActive = false, smooth = false) {
        if (!this.viewport || this.destroyed) return;
        this.carouselEnsureActive ||= ensureActive;
        this.carouselSmooth ||= smooth;
        if (this.carouselFrame) return;
        this.carouselFrame = requestAnimationFrame(() => {
            this.carouselFrame = null;
            const ensure = this.carouselEnsureActive, animate = this.carouselSmooth;
            this.carouselEnsureActive = this.carouselSmooth = false;
            this.updateCarousel(ensure, animate);
        });
    }

    updateCarousel(ensureActive, smooth) {
        if (this.destroyed || !this.viewport) return;
        // Medir primero sin flechas evita que su ancho mantenga un desbordamiento artificial.
        this.indicator.classList.remove('wizard__steps--centered');
        this.carouselPrev.hidden = this.carouselNext.hidden = true;
        this.carouselActive = this.viewport.clientWidth > 0 && this.viewport.scrollWidth > this.viewport.clientWidth + 1;
        this.stepsWrapper.classList.toggle('wizard__carousel--active', this.carouselActive);
        this.viewport.tabIndex = this.carouselActive ? 0 : -1;
        this.carouselPrev.hidden = this.carouselNext.hidden = !this.carouselActive;
        if (this.carouselActive) {
            const viewport = this.viewport.getBoundingClientRect();
            let active = this.steps[this.current].item.getBoundingClientRect();
            const estilo = getComputedStyle(this.viewport);
            const anchoDisponible = this.viewport.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
            const separacion = parseFloat(getComputedStyle(this.indicator).columnGap) || 0;
            const centrar = anchoDisponible + 1 >= active.width * 2 + separacion;
            if (centrar) {
                const visibles = this.steps.filter(step => step.enabled);
                const inicio = Math.max(0, (anchoDisponible - visibles[0].item.getBoundingClientRect().width) / 2 - separacion);
                const fin = Math.max(0, (anchoDisponible - visibles.at(-1).item.getBoundingClientRect().width) / 2 - separacion);
                this.indicator.style.setProperty('--wizard-step-space-start', `${inicio}px`);
                this.indicator.style.setProperty('--wizard-step-space-end', `${fin}px`);
                this.indicator.classList.add('wizard__steps--centered');
                // Ajustar con la extensión real: el padding final de un flex desbordado
                // no se incluye igual en scrollWidth en todos los navegadores.
                const ultimo = visibles.at(-1).item.getBoundingClientRect();
                const maxNecesario = this.viewport.scrollLeft + (ultimo.left + ultimo.right - viewport.left - viewport.right) / 2;
                const ajuste = maxNecesario - (this.viewport.scrollWidth - this.viewport.clientWidth);
                if (Math.abs(ajuste) > 1) this.indicator.style.setProperty('--wizard-step-space-end', `${Math.max(0, fin + ajuste)}px`);
                active = this.steps[this.current].item.getBoundingClientRect();
            }
            const delta = centrar ? (active.left + active.right - viewport.left - viewport.right) / 2 :
                active.left < viewport.left ? active.left - viewport.left :
                active.right > viewport.right ? active.right - viewport.right : 0;
            const destino = Math.max(0, Math.min(this.viewport.scrollWidth - this.viewport.clientWidth, this.viewport.scrollLeft + delta));
            if (ensureActive && Math.abs(destino - this.viewport.scrollLeft) > 1) this.scrollIndicatorTo(destino, smooth);
        }
        this.updateCarouselButtons();
    }

    updateCarouselButtons() {
        if (!this.viewport || this.destroyed) return;
        this.carouselPrev.disabled = !this.carouselActive || this.viewport.scrollLeft <= 1;
        this.carouselNext.disabled = !this.carouselActive || this.viewport.scrollLeft >= this.viewport.scrollWidth - this.viewport.clientWidth - 1;
    }

    scrollIndicator(direction) {
        if (!this.carouselActive) return;
        this.scrollIndicatorTo(this.viewport.scrollLeft + direction * Math.max(1, this.viewport.clientWidth * .8));
    }

    scrollIndicatorTo(left, smooth = true) {
        const animate = smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.viewport.scrollTo({ left, behavior: animate ? 'smooth' : 'instant' });
        this.updateCarouselButtons();
    }

    busy() { return this.externalLoading; }

    updateView({ steps, previous, saveDisabled, next }) {
        if (this.destroyed) return;
        let visibilityChanged = false;
        for (const [index, step] of this.steps.entries()) {
            const view = steps[index];
            visibilityChanged ||= step.enabled !== view.enabled;
            const { enabled, completed, disabled, detail, status, tooltip } = view;
            Object.assign(step, { enabled, completed, disabled, detail, status, tooltip });
        }
        this.controls = { previous, saveDisabled, next };
        this.update();
        if (visibilityChanged) this.scheduleCarousel(true);
    }

    update() {
        if (!this.root || this.destroyed) return;
        const busy = this.busy();
        this.root.dataset.state = this.state;
        this.root.setAttribute('aria-busy', String(busy));
        let visible = 0, completed = 0, position = 0;
        this.steps.forEach((step, index) => {
            const active = index === this.current;
            if (step.enabled) {
                visible++;
                if (step.completed) completed++;
            }
            if (active) position = visible;
            step.panel.hidden = !active;
            step.item.className = `wizard__step${active ? ' wizard__step--active' : ''}${step.completed ? ' wizard__step--completed' : ''}`;
            step.item.hidden = !step.enabled;
            step.button.disabled = busy || !step.enabled || step.disabled || active;
            step.button.title = step.tooltip ?? '';
            if (active) step.button.setAttribute('aria-current', 'step'); else step.button.removeAttribute('aria-current');
            step.number.textContent = step.completed ? '✓' : step.enabled ? String(visible) : '0';
            step.detailLabel.textContent = step.detail;
            step.stateLabel.textContent = `${active ? 'Actual · ' : ''}${step.status}`;
        });
        this.progress.max = Math.max(1, visible);
        this.progress.value = completed;
        const label = this.state === 'initial' ? 'Inicial' : 'En progreso';
        const announcement = `${busy ? loadingText + ' ' : ''}${label} · Paso ${position} de ${visible}`;
        if (this.status.textContent !== announcement) this.status.textContent = announcement;
        this.loading.hidden = !busy;
        const { previous, saveDisabled, next } = this.controls;
        this.back.title = previous.title;
        this.back.disabled = busy || previous.disabled;
        this.save.disabled = busy || saveDisabled;
        this.forward.textContent = next.text;
        this.forward.disabled = busy || next.disabled;
        if (this.carouselCurrent !== this.current) {
            const initial = this.carouselCurrent === undefined;
            this.carouselCurrent = this.current;
            this.scheduleCarousel(true, !initial);
        }
    }

    getCurrentStep() {
        const { id, title, enabled, completed } = this.steps[this.current];
        return { id, title, enabled, completed };
    }
    getSteps() {
        return this.steps.map(({ id, title, enabled, completed }) => ({ id, title, enabled, completed }));
    }

    goToStep(id) {
        if (this.destroyed || !this.root || this.busy()) return false;
        const index = this.steps.findIndex(step => step.id === id && step.enabled);
        if (index < 0 || index === this.current) return false;
        this.current = index;
        this.state = 'in-progress';
        this.update();
        this.steps[index].heading.focus();
        return true;
    }

    setLoading(loading) {
        if (typeof loading !== 'boolean') throw new TypeError('Wizard: loading debe ser booleano.');
        if (!this.destroyed) { this.externalLoading = loading; this.update(); }
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.carouselObserver?.disconnect();
        if (this.carouselFrame) cancelAnimationFrame(this.carouselFrame);
        if (this.viewport) {
            this.viewport.removeEventListener('scroll', this.onIndicatorScroll);
            this.viewport.removeEventListener('keydown', this.onIndicatorKey);
            if (!this.carouselObserver) window.removeEventListener('resize', this.onCarouselResize);
        }
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
            step.content = step.detailLabel = step.item = step.button = step.number = step.stateLabel = step.panel = step.heading = null;
        });
        this.actions = null;
        this.root = this.container = this.header = this.indicator = this.progress = this.status = this.content = this.loading = this.footer = this.back = this.save = this.forward = null;
        this.onClick = this.onEdit = this.onSubmit = null;
        this.stepsWrapper = this.viewport = this.carouselPrev = this.carouselNext = this.carouselObserver = this.carouselFrame = null;
        this.onIndicatorScroll = this.onIndicatorKey = this.onCarouselResize = null;
    }
}
