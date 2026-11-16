const positions = ['top-right', 'top-left', 'top-center', 'bottom-right', 'bottom-left', 'bottom-center'];
const icons = {
    success: 'M5 12l4 4L19 6',
    error: 'M7 7l10 10M17 7L7 17',
    warning: 'M12 8v5m0 3h.01M12 3L2 21h20Z',
    info: 'M12 11v6m0-10h.01'
};
const initial = { type: 'info', title: '', position: 'top-right', duration: 4000,
    maxVisible: 5, closable: true, pauseOnHover: true, showProgress: true, animated: true };
let defaults = { ...initial }, sequence = 0;
const records = new Map(), containers = new Map(), queue = [];
const booleanKeys = ['closable', 'pauseOnHover', 'showProgress', 'animated'];

// Las configuraciones inválidas se rechazan completas, sin alterar el estado.
function valid(options, global = false) {
    return options !== null && typeof options === 'object' && !Array.isArray(options) &&
        Object.entries(options).every(([key, value]) => {
            if (booleanKeys.includes(key)) return typeof value === 'boolean';
            if (key === 'type') return typeof value === 'string' && Object.hasOwn(icons, value);
            if (key === 'position') return positions.includes(value);
            if (key === 'duration') return Number.isFinite(value) && value >= 0 && value <= 2147483647;
            if (key === 'maxVisible') return global && Number.isInteger(value) && value > 0;
            if (key === 'title') return typeof value === 'string';
            if (key === 'message') return !global && typeof value === 'string' && !!value.trim();
            return false;
        });
}

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

function container(position) {
    if (!containers.has(position)) {
        const node = element('div', `toast-container toast-container--${position}`);
        document.body.append(node);
        containers.set(position, node);
    }
    return containers.get(position);
}

function motion(record) {
    return record.options.animated && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function resume(record) {
    if (record.state !== 'visible' || !record.options.duration || record.pauses.size || record.timer !== null) return;
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
        record.progress.style.transform = `scaleX(${record.remaining / record.options.duration})`;
    }
}

function unpause(record, reason) {
    record.pauses.delete(reason);
    resume(record);
}

function mount(record) {
    const o = record.options;
    record.state = 'visible';
    const slot = element('div', 'toast-slot');
    const shell = element('div', 'toast-shell');
    const node = element('div', `toast toast--${o.type}`);
    slot.id = record.id;
    if (!motion(record)) slot.classList.add('toast-slot--static');
    const content = element('div', 'toast__content');
    content.setAttribute('role', o.type === 'error' ? 'alert' : 'status');
    content.setAttribute('aria-atomic', 'true');
    node.append(icon(o.type), content);
    if (o.closable) {
        const close = element('button', 'toast__close', '×');
        close.type = 'button';
        close.setAttribute('aria-label', 'Cerrar notificación');
        close.onclick = () => Toast.dismiss(record.id);
        node.append(close);
    }
    if (o.showProgress && o.duration) {
        record.progress = element('div', 'toast__progress');
        record.progress.setAttribute('aria-hidden', 'true');
        node.append(record.progress);
    }
    if (o.pauseOnHover) {
        slot.onmouseenter = () => pause(record, 'hover');
        slot.onmouseleave = () => unpause(record, 'hover');
    }
    // El foco siempre pausa para que el botón siga disponible al usar teclado.
    record.onFocusIn = () => pause(record, 'focus');
    record.onFocusOut = event => {
        if (!slot.contains(event.relatedTarget)) unpause(record, 'focus');
    };
    slot.addEventListener('focusin', record.onFocusIn);
    slot.addEventListener('focusout', record.onFocusOut);
    shell.append(node); slot.append(shell);
    container(o.position).append(slot);
    record.slot = slot;
    // Crear primero la región vacía permite anunciar el contenido una sola vez.
    record.announce = setTimeout(() => {
        if (o.title) content.append(element('div', 'toast__title', o.title));
        content.append(element('p', 'toast__message', o.message));
        record.announce = null;
    }, 0);
    resume(record);
}

function pump() {
    let visible = [...records.values()].filter(record => record.state !== 'queued').length;
    while (queue.length && visible < defaults.maxVisible) {
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
        slot.remove();
    }
    records.delete(record.id);
    record.slot = record.progress = null;
    record.onFocusIn = record.onFocusOut = null;
    record.pauses.clear();
}

/** Servicio compartido por todos los imports ES; no necesita inicialización ni red. */
const Toast = {
    show(options) {
        if (!valid(options) || !options.message?.trim() || !document.body) return null;
        const o = { ...defaults, ...options };
        const id = `toast-${++sequence}`;
        const record = { id, options: o, state: 'queued', remaining: o.duration, timer: null, pauses: new Set() };
        records.set(id, record);
        queue.push(record);
        pump();
        return id;
    },
    success(message, options = {}) { return shortcut('success', message, options); },
    error(message, options = {}) { return shortcut('error', message, options); },
    warning(message, options = {}) { return shortcut('warning', message, options); },
    info(message, options = {}) { return shortcut('info', message, options); },
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
            if (motion(record)) {
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
    },
    configure(options) {
        if (!valid(options, true)) return false;
        defaults = { ...defaults, ...options };
        pump();
        return true;
    }
};

function shortcut(type, message, options) {
    if (!valid(options)) return null;
    return Toast.show({ ...options, type, message });
}

export default Toast;
