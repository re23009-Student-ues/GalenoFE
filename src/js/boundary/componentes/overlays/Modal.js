let sequence = 0;
const stack = [];
const sizes = ['small', 'medium', 'large', 'fullscreen'];
const variants = ['primary', 'secondary', 'danger'];
const defaults = { title: 'Diálogo', size: 'medium', closable: true,
    closeOnEscape: true, closeOnOverlay: true, animated: true, actions: [] };

function node(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

/** Diálogo nativo. El contenido se mueve, no se clona; se restaura al reemplazarlo o destruir. */
export default class Modal {
    constructor(options = {}) {
        if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Modal: opciones inválidas.');
        this.options = { ...defaults, ...options };
        const o = this.options;
        if (typeof o.title !== 'string' || !o.title.trim() || !sizes.includes(o.size) ||
            ['closable', 'closeOnEscape', 'closeOnOverlay', 'animated'].some(key => typeof o[key] !== 'boolean') ||
            ['onOpen', 'onClose'].some(key => o[key] !== undefined && typeof o[key] !== 'function') ||
            (o.initialFocus !== undefined && typeof o.initialFocus !== 'string' && !(o.initialFocus instanceof HTMLElement)) ||
            !Array.isArray(o.actions) || o.actions.some(action => !action || typeof action.label !== 'string' || !action.label.trim() ||
                (action.variant !== undefined && !variants.includes(action.variant)) ||
                (action.disabled !== undefined && typeof action.disabled !== 'boolean') || typeof action.onClick !== 'function')) {
            throw new TypeError('Modal: título, tamaño, acciones o configuración inválidos.');
        }
        this.element = node('dialog', `modal modal--${o.size}${o.animated ? '' : ' modal--static'}`);
        if (typeof this.element.showModal !== 'function') throw new Error('Modal requiere un navegador compatible con dialog.showModal().');
        this.element.setAttribute('aria-modal', 'true');
        this.header = node('header', 'modal__header');
        this.title = node('h2', 'modal__title', o.title);
        this.title.id = `modal-title-${++sequence}`;
        this.element.setAttribute('aria-labelledby', this.title.id);
        this.closeButton = node('button', 'modal__close', '×');
        this.closeButton.type = 'button';
        this.closeButton.setAttribute('aria-label', 'Cerrar diálogo');
        this.closeButton.hidden = !o.closable;
        this.closeButton.onclick = () => this.close();
        this.header.append(this.title, this.closeButton);
        this.body = node('div', 'modal__body');
        this.footer = node('footer', 'modal__footer');
        this.footer.hidden = !o.actions.length;
        for (const action of o.actions) {
            const button = node('button', `modal__action modal__action--${action.variant || 'secondary'}`, action.label);
            button.type = 'button'; button.disabled = action.disabled ?? false;
            button.onclick = event => { if (!this.busy) action.onClick(this, event); };
            this.footer.append(button);
        }
        this.element.append(this.header, this.body, this.footer);
        this.owned = [];
        this.disabledButtons = new Map();
        this.busy = false; this.opened = false; this.destroyed = false;
        this.onCancel = event => {
            event.preventDefault();
            if (stack.at(-1) === this && o.closable && o.closeOnEscape) this.close();
        };
        this.onNativeClose = () => { if (!this.element.open) this.finishClose(); };
        this.outside = event => {
            const rect = this.element.getBoundingClientRect();
            return event.target === this.element && (event.clientX < rect.left || event.clientX > rect.right ||
                event.clientY < rect.top || event.clientY > rect.bottom);
        };
        this.onPointerDown = event => { this.backdropPress = this.outside(event); };
        this.onClick = event => {
            if (this.backdropPress && this.outside(event) && stack.at(-1) === this && o.closable && o.closeOnOverlay) this.close();
            this.backdropPress = false;
        };
        this.onSubmit = event => { if (this.busy && (event.submitter?.formMethod || event.target.method) === 'dialog') event.preventDefault(); };
        this.element.addEventListener('cancel', this.onCancel);
        this.element.addEventListener('close', this.onNativeClose);
        this.element.addEventListener('pointerdown', this.onPointerDown);
        this.element.addEventListener('click', this.onClick);
        this.element.addEventListener('submit', this.onSubmit);
    }

    open() {
        if (this.destroyed || this.opened) return this;
        if (!document.body) throw new Error('Modal.open requiere document.body.');
        this.opener = document.activeElement;
        document.body.append(this.element);
        this.element.showModal();
        this.opened = true;
        stack.push(this);
        let focus = this.options.initialFocus;
        if (typeof focus === 'string') {
            try { focus = this.element.querySelector(focus); } catch { focus = null; }
        }
        if (focus instanceof HTMLElement && this.element.contains(focus)) focus.focus();
        this.options.onOpen?.(this);
        return this;
    }

    close() {
        if (this.destroyed || !this.opened || this.busy) return this;
        this.element.close();
        this.finishClose();
        return this;
    }

    finishClose() {
        if (!this.opened) return;
        this.opened = false;
        const wasTop = stack.at(-1) === this;
        const index = stack.indexOf(this);
        if (index !== -1) stack.splice(index, 1);
        const top = stack.at(-1);
        if (wasTop && this.opener?.isConnected && (!top || top.element.contains(this.opener))) this.opener.focus();
        this.opener = null;
        this.options.onClose?.(this);
    }

    isOpen() { return this.opened && this.element.open; }

    setTitle(title) {
        if (typeof title !== 'string' || !title.trim()) throw new TypeError('Modal: título no vacío requerido.');
        if (!this.destroyed) this.title.textContent = title;
        return this;
    }

    setContent(content) {
        if (this.destroyed) return this;
        if (typeof content !== 'string' && (!(content instanceof Node) ||
            ![Node.ELEMENT_NODE, Node.TEXT_NODE, Node.DOCUMENT_FRAGMENT_NODE].includes(content.nodeType) ||
            content === this.element || content === this.body || content.contains(this.element) || this.header.contains(content) || this.footer.contains(content))) {
            throw new TypeError('Modal: contenido debe ser texto o un nodo DOM de la página.');
        }
        this.restoreContent();
        this.body.replaceChildren();
        if (typeof content === 'string') this.body.textContent = content;
        else {
            const nodes = content.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? [...content.childNodes] : [content];
            for (const child of nodes) {
                const marker = child.parentNode ? document.createComment('modal: ubicación original') : null;
                if (marker) child.before(marker);
                this.owned.push({ child, marker });
                this.body.append(child);
            }
        }
        return this;
    }

    restoreContent() {
        for (const { child, marker } of this.owned) {
            if (marker?.parentNode) marker.replaceWith(child);
            else child.remove();
        }
        this.owned.length = 0;
    }

    /** Bloquea todos los cierres ordinarios y las acciones; destroy siempre puede liberar recursos. */
    setBusy(busy) {
        if (typeof busy !== 'boolean') throw new TypeError('Modal: busy debe ser booleano.');
        if (this.destroyed || this.busy === busy) return this;
        this.busy = busy;
        this.element.setAttribute('aria-busy', String(busy));
        if (busy) {
            for (const button of [this.closeButton, ...this.footer.querySelectorAll('button')]) {
                this.disabledButtons.set(button, button.disabled); button.disabled = true;
            }
        } else {
            for (const [button, disabled] of this.disabledButtons) button.disabled = disabled;
            this.disabledButtons.clear();
        }
        return this;
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        try {
            if (this.element.open) this.element.close();
            this.finishClose();
        } finally {
            this.restoreContent();
            for (const button of [this.closeButton, ...this.footer.querySelectorAll('button')]) button.onclick = null;
            this.element.removeEventListener('cancel', this.onCancel);
            this.element.removeEventListener('close', this.onNativeClose);
            this.element.removeEventListener('pointerdown', this.onPointerDown);
            this.element.removeEventListener('click', this.onClick);
            this.element.removeEventListener('submit', this.onSubmit);
            this.element.remove();
            this.body.replaceChildren(); this.footer.replaceChildren();
            this.disabledButtons.clear();
            this.options = {};
            this.opener = null;
            this.onCancel = this.onNativeClose = this.onPointerDown = this.onClick = this.onSubmit = this.outside = null;
        }
    }
}
