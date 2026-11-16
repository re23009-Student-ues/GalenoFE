/** Sugiere un ejemplo visual; nunca modifica lo escrito ni sustituye la validación REST. */
export function ejemploDocumento(tipo) {
    if (!tipo?.expresionRegular) return '';
    try {
        const formato = new RegExp(`^(?:${tipo.expresionRegular})$`);
        // Formatos habituales con cantidades fijas o mínimas de dígitos/letras.
        const ejemplo = tipo.expresionRegular
            .replace(/^\^|\$$/g, '')
            .replace(/(\[0-9\]|\\d|\[A-Z\]|\[a-z\]|\[A-Za-z\]|\[A-Z0-9\])(?:\{(\d+)(?:,\d*)?\})?/g,
                (_, grupo, cantidad = 1) => {
                    const caracter = grupo === '[a-z]' ? 'a' : grupo.includes('A') ? 'A' : '0';
                    return caracter.repeat(Math.min(Number(cantidad), 64));
                })
            .replace(/\\([-/. ])/g, '$1');
        const ejemplos = [ejemplo, '00000000-0', '0000-000000-000-0', 'A00000000', 'AB123456'];
        return ejemplos.find(valor => valor && formato.test(valor)) || '';
    } catch { return ''; } // Sin ejemplo antes que sugerir un formato incorrecto.
}
 