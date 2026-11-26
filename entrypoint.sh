#!/bin/sh
set -eu
root=/var/www/html

for file in index.html js/control/default_service.js serviceWorker.js; do
    if [ ! -r "$root/$file" ]; then
        echo "Falta un archivo legible: $root/$file" >&2
        exit 1
    fi
done

grep -Fq 'this.BASE_URL = `${location.origin}/galeno/resources/v1/`;' "$root/js/control/default_service.js" || exit 1
grep -Fq '/galeno/resources/v1/' "$root/serviceWorker.js" || exit 1

nginx -t
exec "$@"
