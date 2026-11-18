import Modal from './Modal.js';

let sequence = 0;
const types = ['default', 'warning'];
const defaults = { title: 'Confirmar acción', message: '¿Deseas continuar?', type: 'default',
    confirmText: 'Confirmar', cancelText: 'Cancelar', processingText: 'Procesando…',
    errorMessage: 'No fue posible completar la acción. Intenta nuevamente.' };

function validate(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('ConfirmDialog: opciones inválidas.');
    const o = { ...defaults, ...options };
    if (!types.includes(o.type) || ['title', 'message', 'confirmText', 'cancelText', 'processingText', 'errorMessage'].some(key =>
        typeof o[key] !== 'string' || !o[key].trim()) ||
        (o.onConfirm !== undefined && typeof o.onConfirm !== 'function')) {
        throw new TypeError('ConfirmDialog: mensaje, tipo o confirmación inválidos.');
    }
    return o;
}

function icon(type) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', type === 'warning' ? 'M12 3L2 21h20ZM12 9v5m0 3h.01' : 'M12 10v7m0-10h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20');
    svg.append(path);
    return svg;
}

/** Modal especializado. El resultado solo es true después de completar onConfirm. */
export default class ConfirmDialog extends Modal {
    constructor(options = {}) {
        const o = validate(options);
        super({ title: o.title, size: 'small', initialFocus: '.confirm-dialog__cancel',
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
        this.footer.classList.add('confirm-dialog__actions');
        this.footer.firstElementChild.classList.add('confirm-dialog__cancel');
        this.footer.lastElementChild.classList.add('confirm-dialog__confirm');
        const content = document.createElement('div');
        const image = icon(o.type);
        image.classList.add('confirm-dialog__icon');
        image.setAttribute('aria-hidden', 'true'); image.setAttribute('focusable', 'false');
        content.append(image);
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
}
