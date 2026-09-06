FROM php:8.3-fpm-alpine

RUN apk add --no-cache sqlite-dev \
    && docker-php-ext-install pdo_sqlite

WORKDIR /app

RUN mkdir -p /var/lib/quantum-builder \
    && chown -R www-data:www-data /var/lib/quantum-builder

USER www-data
