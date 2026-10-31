export function parseFecha(texto) {
    if (!texto) return null;
    return new Date(texto.replace(/\[.*\]$/, ""));
}

export function formatoFecha(texto) {
    const f = parseFecha(texto);
    return f ? f.toLocaleString("es-SV", { dateStyle: "full", timeStyle: "short" }) : "";
}

export function estadoConsulta(c, ahora = new Date()) {
    const inicio = parseFecha(c.fechaInicio);
    const fin = parseFecha(c.fechaFin);
    if (fin && fin <= ahora) return "Finalizada";
    if (inicio && inicio > ahora) return "Programada";
    return "En curso";
}


export function formatoCorto(fecha) {
    return fecha.toLocaleString("es-SV", { dateStyle: "medium", timeStyle: "short" });
}