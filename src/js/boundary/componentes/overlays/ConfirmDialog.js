import Modal from './Modal.js';

const queue = [];
let active = null;
let sequence = 0;
const types = ['default', 'danger', 'warning', 'info'];
const defaults = { title: 'Confirmar acción', message: '¿Deseas continuar?', type: 'default',
    confirmText: 'Confirmar', cancelText: 'Cancelar', processingText: 'Procesando…',
    errorMessage: 'No fue posible completar la acción. Intenta nuevamente.' };

function validate(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('ConfirmDialog: opciones inválidas.');
    const o = { ...defaults, ...options };
    if (!types.includes(o.type) || ['title', 'message', 'confirmText', 'cancelText', 'processingText', 'errorMessage'].some(key =>
        typeof o[key] !== 'string' || !o[key].trim()) ||
        ['onConfirm', 'onCancel'].some(key => o[key] !== undefined && typeof o[key] !== 'function') ||
        (o.color !== undefined && (typeof o.color !== 'string' || !CSS.supports('color', o.color))) ||
        (o.icon !== undefined && o.icon !== false && !(o.icon instanceof SVGElement))) {
        throw new TypeError('ConfirmDialog: mensaje, tipo, callbacks o personalización inválidos.');
    }
    return o;
}

function icon(type) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', type === 'danger' || type === 'warning' ? 'M12 3L2 21h20ZM12 9v5m0 3h.01' : 'M12 10v7m0-10h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20');
    svg.append(path);
    return svg;
}

/** Modal especializado. El resultado solo es true después de completar onConfirm. */
export default class ConfirmDialog extends Modal {
    constructor(options = {}) {
        const o = validate(options);
        super({ title: o.title, size: o.size ?? 'small', closable: o.closable ?? true,
            closeOnEscape: o.closeOnEscape ?? true, closeOnOverlay: o.closeOnOverlay ?? true,
            animated: o.animated ?? true, initialFocus: '.confirm-dialog__cancel',
            onClose: () => this.cancelResult(),
            actions: [
                { label: o.cancelText, onClick: () => this.close() },
                { label: o.confirmText, variant: 'primary', onClick: () => this.confirm() }
            ]
        });
        this.confirmOptions = o;
        this.result = new Promise(resolve => { this.resolveResult = resolve; });
        this.settled = false;
        this.element.classList.add('confirm-dialog', `confirm-dialog--${o.type}`);
        if (o.color) this.element.style.setProperty('--confirm-accent', o.color);
        this.footer.classList.add('confirm-dialog__actions');
        this.footer.firstElementChild.classList.add('confirm-dialog__cancel');
        this.footer.lastElementChild.classList.add('confirm-dialog__confirm');
        const content = document.createElement('div');
        if (o.icon !== false) {
            const image = o.icon ? o.icon.cloneNode(true) : icon(o.type);
            image.classList.add('confirm-dialog__icon');
            image.setAttribute('aria-hidden', 'true'); image.setAttribute('focusable', 'false');
            content.append(image);
        }
        const message = document.createElement('p');
        message.className = 'confirm-dialog__message'; message.textContent = o.message;
        message.id = `confirm-message-${++sequence}`;
        this.element.setAttribute('aria-describedby', message.id);
        this.error = document.createElement('p');
        this.error.className = 'confirm-dialog__error'; this.error.setAttribute('role', 'alert');
        this.status = document.createElement('p');
        this.status.className = 'confirm-dialog__status'; this.status.setAttribute('role', 'status');
        content.append(message, this.error, this.status);
        this.setContent(content);
    }

    settle(value) {
        if (this.settled) return;
        this.settled = true;
        this.resolveResult(value);
        this.resolveResult = null;
    }

    cancelResult() {
        if (this.settled) return;
        this.settle(false);
        this.confirmOptions.onCancel?.();
    }

    async confirm() {
        if (this.busy || this.settled || !this.isOpen()) return;
        this.setBusy(true);
        this.error.textContent = '';
        this.status.textContent = this.confirmOptions.processingText;
        try {
            await this.confirmOptions.onConfirm?.();
            if (this.destroyed) return;
            this.settle(true);
            this.setBusy(false);
            this.close();
        } catch {
            if (this.destroyed) return;
            this.setBusy(false);
            this.status.textContent = '';
            this.error.textContent = this.confirmOptions.errorMessage;
            this.footer.lastElementChild.focus();
        }
    }

    open() { return this.settled ? this : super.open(); }

    destroy() {
        try { super.destroy(); }
        finally {
            this.cancelResult();
            this.confirmOptions = {};
        }
    }

    static show(options = {}) {
        try { validate(options); } catch (error) { return Promise.reject(error); }
        return new Promise((resolve, reject) => {
            queue.push({ options: { ...options }, resolve, reject });
            pump();
        });
    }

    static dismissAll() {
        for (const job of queue.splice(0)) job.resolve(false);
        active?.destroy();
    }
}

function pump() {
    if (active || !queue.length) return;
    const job = queue.shift();
    let dialog;
    try {
        dialog = new ConfirmDialog(job.options);
        active = dialog;
        dialog.open();
    } catch (error) {
        dialog?.destroy(); active = null; job.reject(error); pump(); return;
    }
    dialog.result.then(result => {
        try { dialog.destroy(); }
        finally {
            active = null;
            job.resolve(result);
            pump();
        }
    });
}
