const icons = {
    success: 'M5 12l4 4L19 6',
    error: 'M7 7l10 10M17 7L7 17',
    warning: 'M12 8v5m0 3h.01M12 3L2 21h20Z',
    info: 'M12 11v6m0-10h.01'
};
const duration = 4000;
const maxVisible = 5;
let sequence = 0, toastContainer;
const records = new Map(), queue = [];

function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function icon(type) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'toast__icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', icons[type]);
    svg.append(path);
    return svg;
}

function container() {
    if (!toastContainer?.isConnected) {
        toastContainer = element('div', 'toast-container toast-container--top-right');
        document.body.append(toastContainer);
    }
    return toastContainer;
}

function motion() {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function resume(record) {
    if (record.state !== 'visible' || record.pauses.size || record.timer !== null) return;
    record.started = performance.now();
    if (record.progress) {
        // Forzar el estado inicial antes de iniciar la transición del tiempo restante.
        void record.progress.offsetWidth;
        record.progress.style.transition = `transform ${record.remaining}ms linear`;
        record.progress.style.transform = 'scaleX(0)';
    }
    record.timer = setTimeout(() => Toast.dismiss(record.id), record.remaining);
}

function pause(record, reason) {
    if (record.state !== 'visible') return;
    record.pauses.add(reason);
    if (record.timer === null) return;
    clearTimeout(record.timer);
    record.timer = null;
    record.remaining = Math.max(0, record.remaining - (performance.now() - record.started));
    if (record.progress) {
        record.progress.style.transition = 'none';
        record.progress.style.transform = `scaleX(${record.remaining / record.duration})`;
    }
}

function unpause(record, reason) {
    record.pauses.delete(reason);
    resume(record);
}

function mount(record) {
    record.state = 'visible';
    const slot = element('div', 'toast-slot');
    const shell = element('div', 'toast-shell');
    const node = element('div', `toast toast--${record.type}`);
    slot.id = record.id;
    if (!motion()) slot.classList.add('toast-slot--static');
    const content = element('div', 'toast__content');
    content.setAttribute('role', record.type === 'error' ? 'alert' : 'status');
    content.setAttribute('aria-atomic', 'true');
    const body = element('div', 'toast__body');
    body.append(content);
    if (record.action) {
        const action = element('button', 'toast__action', record.action.label);
        action.type = 'button';
        action.onclick = () => {
            if (Toast.dismiss(record.id)) record.action.run();
        };
        body.append(action);
    }
    node.append(icon(record.type), body);
    const close = element('button', 'toast__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Cerrar notificación');
    close.onclick = () => Toast.dismiss(record.id);
    node.append(close);
    record.progress = element('div', 'toast__progress');
    record.progress.setAttribute('aria-hidden', 'true');
    node.append(record.progress);
    slot.onmouseenter = () => pause(record, 'hover');
    slot.onmouseleave = () => unpause(record, 'hover');
    // El foco siempre pausa para que el botón siga disponible al usar teclado.
    record.onFocusIn = () => pause(record, 'focus');
    record.onFocusOut = event => {
        if (!slot.contains(event.relatedTarget)) unpause(record, 'focus');
    };
    slot.addEventListener('focusin', record.onFocusIn);
    slot.addEventListener('focusout', record.onFocusOut);
    shell.append(node); slot.append(shell);
    if (record.anchor) {
        record.container = element('div', 'toast-container toast-container--below-anchor');
        record.anchor.after(record.container);
    }
    (record.container ?? container()).append(slot);
    record.slot = slot;
    // Crear primero la región vacía permite anunciar el contenido una sola vez.
    record.announce = setTimeout(() => {
        content.append(element('p', 'toast__message', record.message));
        record.announce = null;
    }, 0);
    resume(record);
}

function pump() {
    let visible = [...records.values()].filter(record => record.state !== 'queued').length;
    while (queue.length && visible < maxVisible) {
        mount(queue.shift());
        visible++;
    }
}

function remove(record) {
    clearTimeout(record.exitTimer);
    clearTimeout(record.announce);
    const slot = record.slot;
    if (slot) {
        slot.onmouseenter = slot.onmouseleave = slot.ontransitionend = null;
        slot.removeEventListener('focusin', record.onFocusIn);
        slot.removeEventListener('focusout', record.onFocusOut);
        const close = slot.querySelector('.toast__close');
        if (close) close.onclick = null;
        const action = slot.querySelector('.toast__action');
        if (action) action.onclick = null;
        slot.remove();
    }
    records.delete(record.id);
    record.container?.remove();
    record.slot = record.progress = null;
    record.onFocusIn = record.onFocusOut = null;
    record.pauses.clear();
}

function show(type, message, { duration: requestedDuration, action, anchor } = {}) {
    if (typeof message !== 'string' || !message.trim() || !document.body) return null;
    const timeout = Number.isFinite(requestedDuration) && requestedDuration > 0 ? requestedDuration : duration;
    const id = `toast-${++sequence}`;
    const record = { id, type, message, action, anchor, state: 'queued', duration: timeout, remaining: timeout, timer: null, pauses: new Set() };
    records.set(id, record);
    queue.push(record);
    pump();
    return id;
}

const Toast = {
    success(message) { return show('success', message); },
    error(message) { return show('error', message); },
    warning(message) { return show('warning', message); },
    info(message, options) { return show('info', message, options); },
    dismiss(id) {
        const record = records.get(id);
        if (!record || record.state === 'closing') return false;
        clearTimeout(record.timer); record.timer = null;
        if (record.state === 'queued') {
            queue.splice(queue.indexOf(record), 1);
            remove(record);
        } else {
            record.state = 'closing';
            const finish = () => {
                if (!records.has(id)) return;
                remove(record);
                pump();
            };
            if (motion()) {
                record.slot.classList.add('toast-slot--closing');
                record.slot.ontransitionend = event => {
                    if (event.target === record.slot && event.propertyName === 'grid-template-rows') finish();
                };
                // Respaldo si el navegador no emite transitionend o el CSS no está cargado.
                record.exitTimer = setTimeout(finish, 250);
            } else finish();
        }
        return true;
    },
    dismissAll() {
        // Vaciar primero la cola evita montar pendientes durante la limpieza.
        queue.length = 0;
        for (const record of records.values()) {
            clearTimeout(record.timer);
            remove(record);
        }
    }
};

export default Toast;
