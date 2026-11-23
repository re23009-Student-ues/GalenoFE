FROM debian:stable

# Dependencias del sistema antes de copiar configuración y scripts.
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default /var/www/html/index.nginx-debian.html

COPY nginx.conf /etc/nginx/nginx.conf
COPY --chmod=755 entrypoint.sh /usr/local/bin/galeno-frontend-entrypoint

# Verifica la configuración y la disponibilidad de sub_filter al construir.
RUN nginx -t

EXPOSE 80
STOPSIGNAL SIGQUIT
ENTRYPOINT ["/usr/local/bin/galeno-frontend-entrypoint"]
CMD ["nginx", "-g", "daemon off;"]
