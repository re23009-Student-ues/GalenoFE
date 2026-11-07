import { calculateSlices, sectorPath } from './pie_geometry.js';

const NS = 'http://www.w3.org/2000/svg';
let sequence = 0;
const defaults = {
    data: [], title: '', height: 320,
    colors: ['#2563eb', '#15803d', '#b91c1c', '#7e22ce', '#a16207', '#0e7490'],
    showLegend: true, showLabels: true, showPercentages: true,
    animated: true, responsive: true
};
function svg(tag, attributes = {}, text) {
    const element = document.createElementNS(NS, tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    if (text !== undefined) element.textContent = text;
    return element;
}

/** Gráfico circular SVG independiente de servicios y peticiones HTTP. */
export default class PieChart {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!(this.container instanceof Element)) throw new Error('PieChart: contenedor inexistente.');
        this.options = { ...defaults, ...options };
        const o = this.options;
        if (!Number.isFinite(o.height) || o.height < 160 || !Array.isArray(o.colors) || !o.colors.length ||
            o.colors.some(color => typeof color !== 'string' || !CSS.supports('color', color))) {
            throw new TypeError('PieChart: altura (mínimo 160) o colores inválidos.');
        }
        for (const key of ['showLegend', 'showLabels', 'showPercentages', 'animated', 'responsive']) {
            if (typeof o[key] !== 'boolean') throw new TypeError(`PieChart: ${key} debe ser booleano.`);
        }
        this.slices = calculateSlices(o.data);
        this.id = `pie-chart-${++sequence}`;
        this.format = new Intl.NumberFormat('es');
        this.percent = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });
        this.destroyed = false;
    }

    render() {
        this.assertActive();
        if (!this.root) {
            this.root = document.createElement('section');
            this.root.className = 'pie-chart';
            this.container.append(this.root);
            if (this.options.responsive) {
                if (typeof ResizeObserver !== 'undefined') {
                    this.observer = new ResizeObserver(() => {
                        if (!this.destroyed && this.container.clientWidth !== this.containerWidth) this.resize();
                    });
                    this.observer.observe(this.container);
                } else {
                    this.onResize = () => this.resize();
                    window.addEventListener('resize', this.onResize);
                }
            }
        }
        this.draw(true);
        return this;
    }

    update(data) {
        this.assertActive();
        this.slices = calculateSlices(data); // No modificar la vista si falla la validación.
        return this.render();
    }

    resize() {
        this.assertActive();
        if (this.root) this.draw(false);
        return this;
    }

    assertActive() {
        if (this.destroyed) throw new Error('PieChart: la instancia fue destruida.');
    }

    describe(slice) {
        return `${slice.label}: ${this.format.format(slice.value)} (${this.percent.format(slice.percentage)} %)`;
    }

    draw(animate) {
        this.animation?.cancel();
        this.animation = null;
        // Conservar el foco de teclado durante actualizaciones y redimensionamientos.
        const focusedIndex = this.root.contains(document.activeElement) ? document.activeElement.dataset.sliceIndex : undefined;
        this.containerWidth = this.container.clientWidth;
        const width = Math.max(1, this.containerWidth || 600);
        const { height, title, showLegend, showLabels, showPercentages, colors, animated } = this.options;
        this.root.classList.toggle('pie-chart--static', !animated);
        const heading = document.createElement('h3');
        heading.className = 'pie-chart__heading'; heading.textContent = title; heading.hidden = !title;
        const chart = svg('svg', { class: 'pie-chart__svg', viewBox: `0 0 ${width} ${height}`,
            role: 'group', 'aria-labelledby': `${this.id}-title`, 'aria-describedby': `${this.id}-desc` });
        chart.append(svg('title', { id: `${this.id}-title` }, title || 'Gráfico circular'),
            svg('desc', { id: `${this.id}-desc` }, this.slices.map(slice => this.describe(slice)).join('; ') || 'No hay datos disponibles.'));
        const tooltip = document.createElement('div');
        tooltip.className = 'pie-chart__tooltip'; tooltip.hidden = true; tooltip.setAttribute('aria-hidden', 'true');
        const legend = document.createElement('ul'); legend.className = 'pie-chart__legend';
        const cx = width / 2, cy = height / 2, radius = Math.max(1, Math.min(width, height) / 2 - 12);
        const visible = this.slices.filter(slice => slice.fraction > 0);
        this.slices.forEach((slice, index) => {
            const color = colors[index % colors.length];
            if (showLegend) {
                const item = document.createElement('li'); item.className = 'pie-chart__legend-item';
                const swatch = document.createElement('span'); swatch.className = 'pie-chart__swatch';
                swatch.style.backgroundColor = color; swatch.setAttribute('aria-hidden', 'true');
                const text = document.createElement('span');
                text.textContent = `${slice.label}: ${this.format.format(slice.value)}${showPercentages ? ` (${this.percent.format(slice.percentage)} %)` : ''}`;
                item.append(swatch, text); legend.append(item);
            }
            if (!slice.fraction) return;
            const path = sectorPath(cx, cy, radius, slice.start, slice.end, visible.length === 1);
            if (!path) return;
            const sector = svg('path', { d: path, class: 'pie-chart__slice', fill: color,
                tabindex: '0', role: 'img', 'aria-label': this.describe(slice), 'data-slice-index': index });
            sector.onpointermove = event => this.showTooltip(tooltip, slice, event.clientX, event.clientY);
            sector.onpointerleave = sector.onblur = () => { tooltip.hidden = true; };
            sector.onfocus = () => {
                const rect = chart.getBoundingClientRect();
                const angle = (slice.start + slice.end) / 2;
                this.showTooltip(tooltip, slice,
                    rect.left + (cx + radius * .6 * Math.cos(angle)) / width * rect.width,
                    rect.top + (cy + radius * .6 * Math.sin(angle)) / height * rect.height);
            };
            sector.onkeydown = event => {
                if (event.key === 'Escape') tooltip.hidden = true;
            };
            chart.append(sector);
            // Solo etiquetas interiores con margen angular y radial suficiente.
            const angle = (slice.start + slice.end) / 2;
            const available = Math.min(radius * .7, radius * .6 * (slice.end - slice.start) * .65);
            const label = showLabels ? slice.label : '';
            const percentage = showPercentages ? `${this.percent.format(slice.percentage)} %` : '';
            const lines = [label, percentage].filter(Boolean);
            if (slice.fraction >= .08 && lines.length && available >= Math.max(...lines.map(line => line.length * 7)) && radius > 55) {
                const x = cx + Math.cos(angle) * radius * .6;
                const y = cy + Math.sin(angle) * radius * .6;
                const text = svg('text', { x, y, class: 'pie-chart__label', 'text-anchor': 'middle', 'aria-hidden': 'true' });
                lines.forEach((line, lineIndex) => text.append(svg('tspan', { x, dy: lineIndex ? 17 : lines.length === 2 ? -4 : 4 }, line)));
                chart.append(text);
            }
        });
        this.root.replaceChildren(heading);
        if (!visible.length) {
            const empty = document.createElement('p'); empty.className = 'pie-chart__empty';
            empty.setAttribute('role', 'status'); empty.textContent = 'No hay datos disponibles';
            this.root.append(empty);
        } else this.root.append(chart, tooltip);
        if (showLegend && this.slices.length) this.root.append(legend);
        if (focusedIndex !== undefined) this.root.querySelector(`[data-slice-index="${focusedIndex}"]`)?.focus();
        if (visible.length && animate && animated && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && chart.animate) {
            // Un fundido evita interpolar arcos incompatibles al agregar o quitar categorías.
            this.animation = chart.animate([{ opacity: .25 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
        }
    }

    showTooltip(tooltip, slice, clientX, clientY) {
        tooltip.textContent = `${slice.label}\n${this.format.format(slice.value)}\n${this.percent.format(slice.percentage)} %`;
        tooltip.hidden = false;
        const rect = this.root.getBoundingClientRect();
        tooltip.style.maxHeight = `${rect.height}px`;
        tooltip.style.left = `${Math.max(0, Math.min(clientX - rect.left + 10, rect.width - tooltip.offsetWidth))}px`;
        tooltip.style.top = `${Math.max(0, Math.min(clientY - rect.top - tooltip.offsetHeight - 8, rect.height - tooltip.offsetHeight))}px`;
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.observer?.disconnect();
        if (this.onResize) window.removeEventListener('resize', this.onResize);
        this.animation?.cancel();
        this.root?.remove();
        this.root = null; this.animation = null; this.observer = null; this.onResize = null;
        this.slices = [];
    }
}
