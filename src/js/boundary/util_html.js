/**
 * Escapa texto para meterlo de forma segura en innerHTML.
 * Los datos vienen de la base: nunca se interpolan sin pasar por aquí.
 * @param {*} texto
 * @returns {string}
 */
export function esc(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}