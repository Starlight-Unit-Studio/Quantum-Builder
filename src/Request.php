<?php

declare(strict_types=1);

namespace QuantumBuilder;

final class Request
{
    public static function decodeJson(string $raw): ?array
    {
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return null;
        }

        // Keep the existing associative payload, but retain JSON array/object
        // distinctions for menu containers. An object such as {"0": {...}}
        // otherwise becomes a PHP list and can bypass the tree validator.
        $objects = json_decode($raw);
        if ($objects instanceof \stdClass
            && ($objects->config ?? null) instanceof \stdClass
            && ($objects->config->navigation ?? null) instanceof \stdClass
            && property_exists($objects->config->navigation, 'items')) {
            $decoded['config']['navigation']['items'] = self::navigationItems($objects->config->navigation->items);
        }
        return $decoded;
    }

    private static function navigationItems(mixed $items): mixed
    {
        if (!is_array($items)) {
            return $items;
        }
        return array_map(static function (mixed $item): mixed {
            if (!$item instanceof \stdClass) {
                return $item;
            }
            $node = get_object_vars($item);
            if (array_key_exists('children', $node)) {
                $node['children'] = self::navigationItems($node['children']);
            }
            return $node;
        }, $items);
    }
}
