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
            && ($objects->config->navigation ?? null) instanceof \stdClass) {
            $navigation = $objects->config->navigation;
            if (property_exists($navigation, 'items')) {
                $decoded['config']['navigation']['items'] = self::navigationItems($navigation->items);
            }
            foreach (['menus', 'rules'] as $field) {
                if (property_exists($navigation, $field)) {
                    $decoded['config']['navigation'][$field] = self::navigationObjects($navigation->$field, $field);
                }
            }
        }
        return $decoded;
    }

    private static function navigationObjects(mixed $list, string $field): mixed
    {
        if (!is_array($list)) {
            return $list;
        }
        return array_map(static function (mixed $value) use ($field): mixed {
            if (!$value instanceof \stdClass) {
                return $value;
            }
            $object = get_object_vars($value);
            if ($field === 'menus' && array_key_exists('items', $object)) {
                $object['items'] = self::navigationItems($object['items']);
            }
            if ($field === 'rules' && ($object['visibility'] ?? null) instanceof \stdClass) {
                $object['visibility'] = get_object_vars($object['visibility']);
            }
            return $object;
        }, $list);
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
