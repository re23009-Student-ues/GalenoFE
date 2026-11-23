#!/bin/sh
set -eu
root=/var/www/html
for file in index.html js/control/default_service.js serviceWorker.js; do
    if [ ! -r "$root/$file" ]; then
        echo "Falta un archivo legible: $root/$file. Monte la carpeta src completa." >&2
        exit 1
    fi
done
# La adaptación depende de la versión de código que fue revisada.
if ! grep -Fq 'this.BASE_URL = `http://${location.hostname}:9080/GalenoSV-1.0-SNAPSHOT/resources/v1/`;' "$root/js/control/default_service.js"; then
    echo 'La URL base cambió: revisar la adaptación de nginx.conf antes de iniciar.' >&2
    exit 1
fi
if ! grep -Fq '/GalenoSV-1.0-SNAPSHOT/resources/v1/' "$root/serviceWorker.js"; then
    echo 'La ruta de API del service worker cambió: revisar nginx.conf.' >&2
    exit 1
fi
nginx -t
exec "$@"
