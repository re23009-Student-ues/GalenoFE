const NS = 'http://www.w3.org/2000/svg';
let sequence = 0;
const defaults = {
    data: [], title: '', orientation: 'vertical', height: 320,
    colors: ['#2563eb'], showGrid: true, showValues: true,
    animated: true, responsive: true, rounded: true, showDataTable: false
};

function validate(data) {
    if (!Array.isArray(data) || data.some(item => !item ||
        typeof item.label !== 'string' || !item.label.trim() ||
        typeof item.value !== 'number' || !Number.isFinite(item.value) || item.value < 0)) {
        throw new TypeError('BarChart: data debe ser un arreglo de { label: texto no vacío, value: número finito >= 0 }.');
    }
    return data.map(({ label, value }) => ({ label, value }));
}

function svg(tag, attributes = {}, content) {
    const element = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (content !== undefined) element.textContent = content;
    return element;
}

/** Gráfico SVG independiente. Los datos negativos se rechazan, nunca se recortan. */
export default class BarChart {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!(this.container instanceof Element)) throw new Error('BarChart: contenedor inexistente.');
        this.options = { ...defaults, ...options };
        const o = this.options;
        if (!['vertical', 'horizontal'].includes(o.orientation) || !Number.isFinite(o.height) || o.height < 160 ||
            !Array.isArray(o.colors) || !o.colors.length || o.colors.some(color => typeof color !== 'string' || !CSS.supports('color', color))) {
            throw new TypeError('BarChart: orientación, altura (mínimo 160) o colores inválidos.');
        }
        this.data = validate(o.data);
        this.id = `bar-chart-${++sequence}`;
        this.bars = [];
        this.destroyed = false;
        this.format = new Intl.NumberFormat('es');
    }

    render() {
        this.assertActive();
        if (!this.root) {
            this.root = document.createElement('section');
            this.root.className = 'bar-chart';
            this.container.append(this.root);
            if (this.options.responsive) {
                if (typeof ResizeObserver !== 'undefined') {
                    this.observer = new ResizeObserver(() => {
                        // Abrir la tabla cambia la altura, pero no requiere redibujar.
                        if (this.container.clientWidth !== this.containerWidth) this.resize();
                    });
                    this.observer.observe(this.container);
                } else {
                    this.onResize = () => this.resize();
                    window.addEventListener('resize', this.onResize);
                }
            }
        }
        this.draw();
        return this;
    }

    update(data) {
        this.assertActive();
        this.data = validate(data); // Validar antes de modificar el estado visible.
        return this.render();
    }

    resize() {
        this.assertActive();
        if (this.root) this.draw();
        return this;
    }

    assertActive() {
        if (this.destroyed) throw new Error('BarChart: la instancia fue destruida.');
    }

    draw() {
        this.animations?.forEach(animation => animation.cancel());
        this.animations = [];
        const o = this.options;
        const dataTableOpen = this.root.querySelector('.bar-chart__data')?.open ?? false;
        this.containerWidth = this.container.clientWidth;
        const width = Math.max(180, this.container.clientWidth || 600);
        const height = o.height;
        const horizontal = o.orientation === 'horizontal';
        const left = horizontal ? Math.min(130, width * .32) : Math.min(64, width * .24);
        const right = horizontal ? Math.min(64, width * .24) : 24;
        const top = 32, bottom = horizontal ? 32 : 68;
        const pw = width - left - right, ph = height - top - bottom;
        const heading = document.createElement('h3');
        heading.className = 'bar-chart__heading';
        heading.textContent = o.title;
        heading.hidden = !o.title;
        const chart = svg('svg', { class: 'bar-chart__svg', viewBox: `0 0 ${width} ${height}`, role: 'img',
            'aria-labelledby': `${this.id}-title ${this.id}-desc` });
        chart.append(svg('title', { id: `${this.id}-title` }, o.title || 'Gráfico de barras'),
            svg('desc', { id: `${this.id}-desc` }, this.data.length ?
                (o.showDataTable ?
                    `${this.data.length} categorías. Valores no negativos. Los datos completos están en la tabla siguiente.` :
                    this.data.map(item => `${item.label}: ${this.format.format(item.value)}`).join('; ')) : 'Sin datos disponibles.'));
        const tooltip = document.createElement('div');
        tooltip.className = 'bar-chart__tooltip';
        tooltip.hidden = true;
        tooltip.setAttribute('aria-hidden', 'true');
        let alternative;
        if (o.showDataTable) {
            alternative = document.createElement('details');
            alternative.className = 'bar-chart__data';
            alternative.open = dataTableOpen;
            const summary = document.createElement('summary');
            summary.textContent = 'Ver datos del gráfico';
            const table = document.createElement('table');
            const header = table.createTHead().insertRow();
            for (const text of ['Categoría', 'Valor']) {
                const th = document.createElement('th'); th.scope = 'col'; th.textContent = text; header.append(th);
            }
            const body = table.createTBody();
            this.data.forEach(item => {
                const row = body.insertRow();
                row.insertCell().textContent = item.label;
                row.insertCell().textContent = this.format.format(item.value);
            });
            alternative.append(summary, table);
        }
        // Las barras se conservan por posición para animar actualizaciones sin recrear listeners.
        const previous = this.bars;
        this.bars = [];
        const max = this.data.reduce((value, item) => Math.max(value, item.value), 0) || 1;
        const power = 10 ** Math.floor(Math.log10(max)) || max;
        const roundedLimit = Math.ceil(max / power) * power;
        const limit = Number.isFinite(roundedLimit) ? roundedLimit : max;
        const ratio = value => value / limit;
        for (let i = 0; i <= 4; i++) {
            const f = i / 4;
            const x = left + pw * f, y = top + ph * (1 - f);
            if (o.showGrid) chart.append(svg('line', horizontal ?
                { x1: x, x2: x, y1: top, y2: top + ph, class: 'bar-chart__grid' } :
                { x1: left, x2: left + pw, y1: y, y2: y, class: 'bar-chart__grid' }));
            chart.append(svg('text', { x: horizontal ? x : left - 8, y: horizontal ? top + ph + 22 : y + 4,
                'text-anchor': horizontal ? 'middle' : 'end', class: 'bar-chart__label' }, this.format.format(limit * f)));
        }
        chart.append(svg('path', { d: `M${left},${top}V${top + ph}H${left + pw}`, class: 'bar-chart__axis' }));
        this.data.forEach((item, i) => {
            const band = (horizontal ? ph : pw) / this.data.length;
            const thickness = Math.min(48, band * .65);
            const length = ratio(item.value) * (horizontal ? pw : ph);
            const x = horizontal ? left : left + band * (i + .5) - thickness / 2;
            const y = horizontal ? top + band * (i + .5) - thickness / 2 : top + ph - length;
            const bar = previous[i] || svg('rect', { class: 'bar-chart__bar', tabindex: '0' });
            const old = { x: bar.getAttribute('x'), y: bar.getAttribute('y'), width: bar.getAttribute('width'), height: bar.getAttribute('height') };
            const attrs = { x, y, width: horizontal ? length : thickness, height: horizontal ? thickness : length,
                rx: o.rounded ? Math.min(5, thickness / 2) : 0, fill: o.colors[i % o.colors.length],
                'aria-label': `${item.label}: ${this.format.format(item.value)}` };
            Object.entries(attrs).forEach(([key, value]) => bar.setAttribute(key, value));
            bar.onpointermove = event => this.showTooltip(tooltip, item, event.clientX, event.clientY);
            bar.onpointerleave = bar.onblur = () => { tooltip.hidden = true; };
            bar.onfocus = () => {
                const rect = bar.getBoundingClientRect();
                this.showTooltip(tooltip, item, rect.x + rect.width / 2, rect.y);
            };
            bar.onkeydown = event => { if (event.key === 'Escape') tooltip.hidden = true; };
            chart.append(bar);
            this.bars.push(bar);
            if (o.animated && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && bar.animate) {
                const from = old.x === null ? { ...attrs, width: horizontal ? 0 : thickness, height: horizontal ? thickness : 0, y: horizontal ? y : top + ph } : old;
                const frame = geometry => Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, `${geometry[key]}px`]));
                this.animations.push(bar.animate([frame(from), frame(attrs)], { duration: 350, easing: 'ease-out' }));
            }
            const label = item.label.length > (horizontal ? 17 : 10) ? `${item.label.slice(0, horizontal ? 16 : 9)}…` : item.label;
            chart.append(svg('text', { x: horizontal ? left - 8 : x + thickness / 2,
                y: horizontal ? y + thickness / 2 + 4 : top + ph + 20,
                'text-anchor': horizontal ? 'end' : 'start',
                transform: horizontal ? '' : `rotate(35 ${x + thickness / 2} ${top + ph + 20})`, class: 'bar-chart__label' }, label));
            if (o.showValues) chart.append(svg('text', { x: horizontal ? x + length + 6 : x + thickness / 2,
                y: horizontal ? y + thickness / 2 + 4 : y - 8, 'text-anchor': horizontal ? 'start' : 'middle',
                class: 'bar-chart__value' }, this.format.format(item.value)));
        });
        this.root.replaceChildren(heading);
        if (this.data.length) {
            this.root.append(chart, tooltip);
            if (alternative) this.root.append(alternative);
        }
        else {
            const empty = document.createElement('p');
            empty.className = 'bar-chart__empty'; empty.setAttribute('role', 'status');
            empty.textContent = 'Sin datos disponibles'; this.root.append(empty);
        }
    }

    showTooltip(tooltip, item, clientX, clientY) {
        tooltip.textContent = `${item.label}: ${this.format.format(item.value)}`;
        tooltip.hidden = false;
        const rect = this.root.getBoundingClientRect();
        tooltip.style.left = `${Math.max(0, Math.min(clientX - rect.left + 10, rect.width - tooltip.offsetWidth))}px`;
        tooltip.style.top = `${Math.max(0, Math.min(clientY - rect.top - tooltip.offsetHeight - 8, rect.height - tooltip.offsetHeight))}px`;
    }

    destroy() {
        if (this.destroyed) return;
        this.observer?.disconnect();
        if (this.onResize) window.removeEventListener('resize', this.onResize);
        this.animations?.forEach(animation => animation.cancel());
        this.bars.forEach(bar => { bar.onpointermove = bar.onpointerleave = bar.onblur = bar.onfocus = bar.onkeydown = null; });
        this.root?.remove();
        this.bars = []; this.animations = []; this.root = null;
        this.destroyed = true;
    }
}
