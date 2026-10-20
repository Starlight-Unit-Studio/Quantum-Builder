FROM php:8.3-fpm-alpine

RUN apk add --no-cache sqlite-dev \
    && docker-php-ext-install pdo_sqlite

WORKDIR /app

COPY docker/php/quantum-builder.ini /usr/local/etc/php/conf.d/quantum-builder.ini

RUN mkdir -p /var/lib/quantum-builder \
    && chown -R www-data:www-data /var/lib/quantum-builder

USER www-data
