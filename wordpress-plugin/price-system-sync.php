<?php
/**
 * Plugin Name: Price System Collector Synchronizer
 * Plugin URI: https://example.com/price-system
 * Description: Custom secure REST API for automated WooCommerce product price synchronization from Price Collector System.
 * Version: 1.0.0
 * Author: Price System Architecture Team
 * Text Domain: price-system-sync
 * Domain Path: /languages
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

class PriceSystemSyncPlugin {
    const API_NAMESPACE = 'price-system/v1';

    public function __construct() {
        add_action('rest_api_init', array($this, 'register_rest_routes'));
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
    }

    /**
     * Register REST API routes
     */
    public function register_rest_routes() {
        // Bulk Update Endpoint
        register_rest_route(self::API_NAMESPACE, '/bulk-update', array(
            'methods'  => 'POST',
            'callback' => array($this, 'handle_bulk_update'),
            'permission_callback' => array($this, 'verify_api_token'),
        ));

        // Single Product Update Endpoint
        register_rest_route(self::API_NAMESPACE, '/update', array(
            'methods'  => 'POST',
            'callback' => array($this, 'handle_single_update'),
            'permission_callback' => array($this, 'verify_api_token'),
        ));

        // Sync Factories / Producers Endpoint
        register_rest_route(self::API_NAMESPACE, '/sync-factories', array(
            'methods'  => 'POST',
            'callback' => array($this, 'handle_sync_factories'),
            'permission_callback' => array($this, 'verify_api_token'),
        ));

        // Sync Price Tables Endpoint
        register_rest_route(self::API_NAMESPACE, '/sync-tables', array(
            'methods'  => 'POST',
            'callback' => array($this, 'handle_sync_tables'),
            'permission_callback' => array($this, 'verify_api_token'),
        ));

        // Update Table Last Update Time Endpoint
        register_rest_route(self::API_NAMESPACE, '/update-table-time', array(
            'methods'  => 'POST',
            'callback' => array($this, 'handle_update_table_time'),
            'permission_callback' => array($this, 'verify_api_token'),
        ));

        // Comprehensive Products Sync & Connect Endpoint
        register_rest_route(self::API_NAMESPACE, '/sync-products', array(
            'methods'  => 'POST',
            'callback' => array($this, 'handle_sync_products'),
            'permission_callback' => array($this, 'verify_api_token'),
        ));

        // Test Connection & Health Check Endpoint
        register_rest_route(self::API_NAMESPACE, '/test-connection', array(
            'methods'  => array('GET', 'POST'),
            'callback' => array($this, 'handle_test_connection'),
            'permission_callback' => array($this, 'verify_api_token'),
        ));

        // Fetch Destination Data (Export WordPress & WooCommerce entities to Price Collector)
        register_rest_route(self::API_NAMESPACE, '/fetch-destination-data', array(
            'methods'  => array('GET', 'POST'),
            'callback' => array($this, 'handle_fetch_destination_data'),
            'permission_callback' => array($this, 'verify_api_token'),
        ));

        register_rest_route(self::API_NAMESPACE, '/fetch-products', array(
            'methods'  => array('GET', 'POST'),
            'callback' => array($this, 'handle_fetch_destination_data'),
            'permission_callback' => array($this, 'verify_api_token'),
        ));

        register_rest_route(self::API_NAMESPACE, '/fetch-factories', array(
            'methods'  => array('GET', 'POST'),
            'callback' => array($this, 'handle_fetch_factories'),
            'permission_callback' => array($this, 'verify_api_token'),
        ));
    }

    /**
     * Handle Test Connection
     */
    public function handle_test_connection($request) {
        return new WP_REST_Response(array(
            'success' => true,
            'status'  => 'connected',
            'message' => 'ارتباط با موفقیت برقرار شد. وب‌سایت وردپرس آماده دریافت و همگام‌سازی است.',
            'site_name' => get_bloginfo('name'),
            'site_url'  => get_bloginfo('url'),
            'woocommerce_active' => class_exists('WooCommerce'),
            'timestamp' => current_time('mysql'),
        ), 200);
    }

    /**
     * Token-based authentication
     */
    public function verify_api_token($request) {
        $configured_token = defined('PRICE_SYSTEM_API_TOKEN') ? PRICE_SYSTEM_API_TOKEN : get_option('price_system_api_token', '');
        
        if (empty($configured_token)) {
            return new WP_Error('auth_not_configured', 'API token is not configured on WordPress.', array('status' => 500));
        }

        $auth_header = $request->get_header('authorization');
        if (empty($auth_header)) {
            return new WP_Error('missing_token', 'Authorization header is missing.', array('status' => 401));
        }

        if (preg_match('/Bearer\s+(\S+)/i', $auth_header, $matches)) {
            $provided_token = $matches[1];
            if (hash_equals($configured_token, $provided_token)) {
                return true;
            }
        }

        return new WP_Error('invalid_token', 'Invalid authorization token.', array('status' => 403));
    }

    /**
     * Handle Bulk Update of Product Prices
     */
    public function handle_bulk_update($request) {
        $params = $request->get_json_params();

        if (empty($params['products']) || !is_array($params['products'])) {
            return new WP_Error('invalid_payload', 'Products array is required.', array('status' => 400));
        }

        $price_table_id = isset($params['price_table_id']) ? intval($params['price_table_id']) : 0;
        $products = $params['products'];

        $updated_count = 0;
        $failed_count = 0;
        $results = array();

        foreach ($products as $item) {
            $post_id = isset($item['post_id']) ? intval($item['post_id']) : 0;
            $new_price = isset($item['price']) ? floatval($item['price']) : null;

            if ($post_id <= 0 || $new_price === null || $new_price <= 0) {
                $failed_count++;
                $results[] = array(
                    'post_id' => $post_id,
                    'success' => false,
                    'error'   => 'شناسه محصول یا قیمت نامعتبر است'
                );
                continue;
            }

            // Verify post exists and is a valid product
            $post = get_post($post_id);
            if (!$post || !in_array($post->post_type, array('product', 'product_variation'))) {
                $failed_count++;
                $results[] = array(
                    'post_id' => $post_id,
                    'success' => false,
                    'error'   => 'پست با این شناسه یافت نشد یا از نوع محصول ووکامرس نیست'
                );
                continue;
            }

            $old_price = floatval(get_post_meta($post_id, '_price', true));
            $price_diff = ($old_price > 0 && $new_price > 0) ? abs($new_price - $old_price) : 0;
            $price_status = 0; // 0 = ثابت (Fixed)
            if ($old_price > 0 && $new_price > 0) {
                if ($new_price > $old_price) {
                    $price_status = 2; // افزایش قیمت (Up arrow)
                } elseif ($new_price < $old_price) {
                    $price_status = 1; // کاهش قیمت (Down arrow)
                }
            }

            // Update WooCommerce standard price fields
            update_post_meta($post_id, '_regular_price', $new_price);
            update_post_meta($post_id, '_price', $new_price);
            update_post_meta($post_id, 'price_status', $price_status);
            update_post_meta($post_id, 'price_diff', $price_diff);
            update_post_meta($post_id, '_price_system_last_sync', current_time('mysql'));
            update_post_meta($post_id, '_price_system_table_id', $price_table_id);

            // Clear WooCommerce transients
            if (function_exists('wc_delete_product_transients')) {
                wc_delete_product_transients($post_id);
            }

            $updated_count++;
            $results[] = array(
                'post_id'      => $post_id,
                'old_price'    => $old_price,
                'new_price'    => $new_price,
                'price_status' => $price_status,
                'price_diff'   => $price_diff,
                'success'      => true
            );
        }

        // If price_table_id is not explicitly passed, attempt to resolve from table_destination_id or destination_id
        if ($price_table_id <= 0) {
            if (isset($params['table_destination_id']) && intval($params['table_destination_id']) > 0) {
                $price_table_id = intval($params['table_destination_id']);
            } elseif (isset($params['destination_id']) && intval($params['destination_id']) > 0) {
                $price_table_id = intval($params['destination_id']);
            }
        }

        // If still 0, check if products have associated table id in postmeta
        if ($price_table_id <= 0 && !empty($products)) {
            foreach ($products as $p_check) {
                $check_pid = isset($p_check['post_id']) ? intval($p_check['post_id']) : 0;
                if ($check_pid > 0) {
                    $associated_tbl = (int) get_post_meta($check_pid, '_price_system_table_id', true);
                    if ($associated_tbl > 0) {
                        $price_table_id = $associated_tbl;
                        break;
                    }
                }
            }
        }

        $timestamp = !empty($params['last_update_time']) ? intval($params['last_update_time']) : time();

        // If price_table_id is resolved, update table's last_update_time and bump cache version
        if ($price_table_id > 0) {
            update_post_meta($price_table_id, 'last_update_time', $timestamp);
            $current_v = (int) get_post_meta($price_table_id, '_price_table_cache_v', true);
            if ($current_v < 1) $current_v = 1;
            update_post_meta($price_table_id, '_price_table_cache_v', $current_v + 1);

            // Invalidate transient caches for this price table
            delete_transient('price_' . $price_table_id);
            wp_cache_delete('price_' . $price_table_id, 'price_table');
        }

        return rest_ensure_response(array(
            'success'          => true,
            'price_table_id'   => $price_table_id,
            'last_update_time' => $timestamp,
            'updated'          => $updated_count,
            'failed'           => $failed_count,
            'items'            => $results
        ));
    }

    /**
     * Handle Direct Update of Table Last Update Time
     */
    public function handle_update_table_time($request) {
        $params = $request->get_json_params();
        $price_table_id = isset($params['price_table_id']) ? intval($params['price_table_id']) : 0;
        if ($price_table_id <= 0 && isset($params['table_destination_id'])) {
            $price_table_id = intval($params['table_destination_id']);
        }
        if ($price_table_id <= 0 && isset($params['destination_id'])) {
            $price_table_id = intval($params['destination_id']);
        }
        if ($price_table_id <= 0 && isset($params['id'])) {
            $price_table_id = intval($params['id']);
        }

        if ($price_table_id <= 0) {
            return new WP_Error('invalid_table_id', 'شناسه معتبر جدول قیمت ارسال نشده است.', array('status' => 400));
        }

        $timestamp = !empty($params['last_update_time']) ? intval($params['last_update_time']) : time();

        // Update post meta 'last_update_time'
        update_post_meta($price_table_id, 'last_update_time', $timestamp);

        // Bump cache version
        $current_v = (int) get_post_meta($price_table_id, '_price_table_cache_v', true);
        if ($current_v < 1) $current_v = 1;
        update_post_meta($price_table_id, '_price_table_cache_v', $current_v + 1);

        // Invalidate transient caches
        delete_transient('price_' . $price_table_id);
        wp_cache_delete('price_' . $price_table_id, 'price_table');

        return rest_ensure_response(array(
            'success'          => true,
            'price_table_id'   => $price_table_id,
            'last_update_time' => $timestamp,
            'cache_version'    => $current_v + 1,
            'message'          => 'متای last_update_time جدول با موفقیت در وردپرس بروز شد.'
        ));
    }

    /**
     * Handle Single Product Price Update
     */
    public function handle_single_update($request) {
        $params = $request->get_json_params();
        $post_id = isset($params['post_id']) ? intval($params['post_id']) : 0;
        $new_price = isset($params['price']) ? floatval($params['price']) : 0;

        if ($post_id <= 0 || $new_price <= 0) {
            return new WP_Error('invalid_data', 'شناسه محصول یا قیمت نامعتبر است', array('status' => 400));
        }

        $post = get_post($post_id);
        if (!$post || !in_array($post->post_type, array('product', 'product_variation'))) {
            return new WP_Error('not_found', 'محصول یافت نشد', array('status' => 404));
        }

        $old_price = floatval(get_post_meta($post_id, '_price', true));

        update_post_meta($post_id, '_regular_price', $new_price);
        update_post_meta($post_id, '_price', $new_price);
        update_post_meta($post_id, '_price_system_last_sync', current_time('mysql'));

        if (function_exists('wc_delete_product_transients')) {
            wc_delete_product_transients($post_id);
        }

        return rest_ensure_response(array(
            'success'   => true,
            'post_id'   => $post_id,
            'old_price' => $old_price,
            'new_price' => $new_price
        ));
    }

    /**
     * Handle Synchronization of Factories / Producers
     */
    public function handle_sync_factories($request) {
        $params = $request->get_json_params();
        $factories = isset($params['factories']) && is_array($params['factories']) ? $params['factories'] : array();

        $results = array();
        $synced_count = 0;

        foreach ($factories as $f) {
            $id = isset($f['id']) ? intval($f['id']) : 0;
            $name = isset($f['name']) ? sanitize_text_field($f['name']) : '';
            $dest_id = isset($f['destination_id']) ? intval($f['destination_id']) : $id;

            if ($id <= 0 || empty($name)) {
                $results[] = array('id' => $id, 'destination_id' => $dest_id, 'name' => $name, 'success' => false, 'error' => 'نام کارخانه یا شناسه خالی است');
                continue;
            }

            // If destination_id corresponds to a taxonomy term (e.g. pa_factory or product_brand)
            if (taxonomy_exists('pa_factory')) {
                $term = term_exists($name, 'pa_factory');
                if (!$term) {
                    $inserted = wp_insert_term($name, 'pa_factory');
                    if (!is_wp_error($inserted)) {
                        $dest_id = $inserted['term_id'];
                    }
                } else {
                    $dest_id = is_array($term) ? $term['term_id'] : intval($term);
                }
            }

            // Save mapping option for persistent lookup
            update_option('price_system_factory_' . $id, array(
                'id' => $id,
                'name' => $name,
                'destination_id' => $dest_id,
                'synced_at' => current_time('mysql')
            ));

            $synced_count++;
            $results[] = array(
                'id' => $id,
                'destination_id' => $dest_id,
                'name' => $name,
                'success' => true
            );
        }

        return rest_ensure_response(array(
            'success' => true,
            'entity'  => 'factories',
            'total'   => count($factories),
            'synced'  => $synced_count,
            'failed'  => count($factories) - $synced_count,
            'message' => "همگام‌سازی {$synced_count} کارخانه با موفقیت در وردپرس ثبت گردید.",
            'items'   => $results
        ));
    }

    /**
     * Handle Synchronization of Price Tables
     */
    public function handle_sync_tables($request) {
        $params = $request->get_json_params();
        $tables = isset($params['tables']) && is_array($params['tables']) ? $params['tables'] : array();

        $results = array();
        $synced_count = 0;

        foreach ($tables as $t) {
            $id = isset($t['id']) ? intval($t['id']) : 0;
            $name = isset($t['name']) ? sanitize_text_field($t['name']) : '';
            $dest_id = isset($t['destination_id']) ? intval($t['destination_id']) : $id;

            if ($id <= 0 || empty($name)) {
                $results[] = array('id' => $id, 'destination_id' => $dest_id, 'name' => $name, 'success' => false, 'error' => 'نام جدول یا شناسه خالی است');
                continue;
            }

            // Save table definition in WordPress options
            update_option('price_system_table_' . $id, array(
                'id' => $id,
                'name' => $name,
                'factory_id' => isset($t['factory_id']) ? intval($t['factory_id']) : 0,
                'destination_id' => $dest_id,
                'default_price_adjustment' => isset($t['default_price_adjustment']) ? floatval($t['default_price_adjustment']) : 0,
                'synced_at' => current_time('mysql')
            ));

            $synced_count++;
            $results[] = array(
                'id' => $id,
                'destination_id' => $dest_id,
                'name' => $name,
                'success' => true
            );
        }

        return rest_ensure_response(array(
            'success' => true,
            'entity'  => 'price_tables',
            'total'   => count($tables),
            'synced'  => $synced_count,
            'failed'  => count($tables) - $synced_count,
            'message' => "همگام‌سازی {$synced_count} جدول قیمت با موفقیت در وردپرس ثبت گردید.",
            'items'   => $results
        ));
    }

    /**
     * Handle Comprehensive Products Sync & Connect
     */
    public function handle_sync_products($request) {
        $params = $request->get_json_params();
        $products = isset($params['products']) && is_array($params['products']) ? $params['products'] : array();

        $results = array();
        $synced_count = 0;

        foreach ($products as $p) {
            $id = isset($p['id']) ? intval($p['id']) : 0;
            $post_id = isset($p['destination_id']) ? intval($p['destination_id']) : (isset($p['post_id']) ? intval($p['post_id']) : 0);
            $name = isset($p['name']) ? sanitize_text_field($p['name']) : '';
            $sku = isset($p['sku']) ? sanitize_text_field($p['sku']) : '';
            $price = isset($p['current_price']) ? floatval($p['current_price']) : 0;

            if ($post_id <= 0) {
                // If post_id is not given, check if a product with this SKU already exists to prevent duplicate insertion
                if (!empty($sku)) {
                    $found_id = wc_get_product_id_by_sku($sku);
                    if ($found_id) {
                        $post_id = $found_id;
                    }
                }
            }

            // Verify or connect post
            if ($post_id > 0) {
                $post = get_post($post_id);
                if ($post) {
                    // Update meta for tight connection
                    update_post_meta($post_id, '_price_system_product_id', $id);
                    update_post_meta($post_id, '_price_system_table_id', isset($p['price_table_id']) ? intval($p['price_table_id']) : 0);
                    update_post_meta($post_id, '_price_system_factory_id', isset($p['factory_id']) ? intval($p['factory_id']) : 0);
                    update_post_meta($post_id, '_price_system_last_sync', current_time('mysql'));

                    if ($price > 0) {
                        update_post_meta($post_id, '_regular_price', $price);
                        update_post_meta($post_id, '_price', $price);
                    }

                    if (function_exists('wc_delete_product_transients')) {
                        wc_delete_product_transients($post_id);
                    }

                    $synced_count++;
                    $results[] = array(
                        'id' => $id,
                        'destination_id' => $post_id,
                        'name' => $name,
                        'success' => true
                    );
                    continue;
                }
            }

            // If product does not exist, record connected virtual destination
            $final_dest_id = $post_id > 0 ? $post_id : $id;
            update_option('price_system_prod_' . $id, array(
                'id' => $id,
                'name' => $name,
                'sku' => $sku,
                'price' => $price,
                'destination_id' => $final_dest_id,
                'synced_at' => current_time('mysql')
            ));

            $synced_count++;
            $results[] = array(
                'id' => $id,
                'destination_id' => $final_dest_id,
                'name' => $name,
                'success' => true
            );
        }

        return rest_ensure_response(array(
            'success' => true,
            'entity'  => 'products',
            'total'   => count($products),
            'synced'  => $synced_count,
            'failed'  => count($products) - $synced_count,
            'message' => "همگام‌سازی و اتصال {$synced_count} محصول با موفقیت انجام شد.",
            'items'   => $results
        ));
    }

    /**
     * Handle Fetch Destination Data (Products, Factories, and Price Tables)
     * Supports full server-side pagination so collectors can stream thousands of products without memory exhaustion.
     * Automatically returns products with active = false as requested by user.
     */
    public function handle_fetch_destination_data($request) {
        $params = $request->get_params();
        $per_page = isset($params['per_page']) ? intval($params['per_page']) : (isset($params['limit']) ? intval($params['limit']) : 250);
        if ($per_page <= 0) $per_page = 250;
        $page = isset($params['page']) ? intval($params['page']) : 1;
        if ($page <= 0) $page = 1;

        // 1. Fetch Factories / Producers from taxonomy 'company' (and fallbacks)
        $factories = array();
        $factory_taxonomies = array('company', 'pa_factory', 'pa_producer', 'pa_karhane', 'pa_brand', 'product_brand');
        $seen_factory_names = array();

        foreach ($factory_taxonomies as $tax) {
            if (taxonomy_exists($tax)) {
                $terms = get_terms(array(
                    'taxonomy'   => $tax,
                    'hide_empty' => false,
                ));
                if (!is_wp_error($terms) && !empty($terms)) {
                    foreach ($terms as $t) {
                        $norm_name = trim($t->name);
                        if (isset($seen_factory_names[$norm_name])) continue;
                        $seen_factory_names[$norm_name] = true;
                        $factories[] = array(
                            'id'             => $t->term_id,
                            'destination_id' => $t->term_id,
                            'name'           => html_entity_decode($t->name, ENT_QUOTES, 'UTF-8'),
                            'slug'           => $t->slug,
                            'count'          => $t->count
                        );
                    }
                }
            }
        }

        // 2. Fetch Categories from 'product_cat'
        $categories = array();
        if (taxonomy_exists('product_cat')) {
            $cat_terms = get_terms(array(
                'taxonomy'   => 'product_cat',
                'hide_empty' => false,
            ));
            if (!is_wp_error($cat_terms) && !empty($cat_terms)) {
                foreach ($cat_terms as $ct) {
                    if ($ct->slug === 'uncategorized' || $ct->name === 'دسته‌بندی نشده') continue;
                    $categories[] = array(
                        'id'             => $ct->term_id,
                        'destination_id' => $ct->term_id,
                        'name'           => html_entity_decode($ct->name, ENT_QUOTES, 'UTF-8'),
                        'slug'           => $ct->slug,
                        'count'          => $ct->count
                    );
                }
            }
        }

        // 3. Fetch Price Tables (from Custom Post Type 'price')
        // Each price table represents a category + factory price list (e.g. میلگرد ذوب آهن)
        $price_tables = array();
        $price_posts = get_posts(array(
            'post_type'      => 'price',
            'post_status'    => array('publish', 'draft', 'pending', 'private'),
            'posts_per_page' => -1,
            'orderby'        => 'ID',
            'order'          => 'ASC'
        ));

        if (!empty($price_posts)) {
            foreach ($price_posts as $pp) {
                $p_company_id = 0;
                $p_company_name = '';
                foreach ($factory_taxonomies as $tax) {
                    if (taxonomy_exists($tax)) {
                        $p_terms = wp_get_post_terms($pp->ID, $tax);
                        if (!empty($p_terms) && !is_wp_error($p_terms)) {
                            $p_company_id = $p_terms[0]->term_id;
                            $p_company_name = html_entity_decode($p_terms[0]->name, ENT_QUOTES, 'UTF-8');
                            break;
                        }
                    }
                }
                if (!$p_company_id) {
                    $p_company_id = intval(get_post_meta($pp->ID, 'company_id', true) ?: get_post_meta($pp->ID, '_company_id', true) ?: get_post_meta($pp->ID, 'factory_id', true));
                }

                $p_cat_id = 0;
                $p_cat_name = '';
                if (taxonomy_exists('product_cat')) {
                    $p_c_terms = wp_get_post_terms($pp->ID, 'product_cat');
                    if (!empty($p_c_terms) && !is_wp_error($p_c_terms)) {
                        $p_cat_id = $p_c_terms[0]->term_id;
                        $p_cat_name = html_entity_decode($p_c_terms[0]->name, ENT_QUOTES, 'UTF-8');
                    }
                }
                if (!$p_cat_id) {
                    $p_cat_id = intval(get_post_meta($pp->ID, 'category_id', true) ?: get_post_meta($pp->ID, '_category_id', true) ?: get_post_meta($pp->ID, 'product_cat_id', true));
                }

                // ACF Mode 1: Manual Products selection (get_field('products'))
                $manual_product_ids = array();
                if (function_exists('get_field')) {
                    $acf_products = get_field('products', $pp->ID);
                    if (!empty($acf_products) && is_array($acf_products)) {
                        foreach ($acf_products as $row) {
                            $prod_item = isset($row['products_product']) ? $row['products_product'] : (is_numeric($row) ? $row : null);
                            if ($prod_item instanceof WP_Post) {
                                $manual_product_ids[] = $prod_item->ID;
                            } elseif (is_numeric($prod_item)) {
                                $manual_product_ids[] = intval($prod_item);
                            }
                        }
                    }
                }

                // ACF Mode 2: Attribute-based filtering (product_by_attr repeater)
                $product_by_attr = array();
                if (function_exists('have_rows') && have_rows('product_by_attr', $pp->ID)) {
                    while (have_rows('product_by_attr', $pp->ID)) {
                        the_row();
                        $attr_tax = get_sub_field('taxonomy');
                        $attr_term = get_sub_field('term');
                        if ($attr_tax && $attr_term) {
                            $product_by_attr[] = array(
                                'taxonomy' => sanitize_text_field($attr_tax),
                                'term'     => sanitize_text_field($attr_term)
                            );
                        }
                    }
                }

                $assignment_mode = !empty($manual_product_ids) ? 'MANUAL' : (!empty($product_by_attr) ? 'ATTRIBUTE' : 'TAXONOMY');

                $price_tables[] = array(
                    'id'                 => $pp->ID,
                    'destination_id'     => $pp->ID,
                    'name'               => html_entity_decode($pp->post_title, ENT_QUOTES, 'UTF-8'),
                    'slug'               => $pp->post_name,
                    'factory_id'         => $p_company_id,
                    'factory_name'       => $p_company_name,
                    'category_id'        => $p_cat_id,
                    'category_name'      => $p_cat_name,
                    'assignment_mode'    => $assignment_mode,
                    'manual_product_ids' => $manual_product_ids,
                    'product_by_attr'    => $product_by_attr,
                    'last_update_time'   => intval(get_post_meta($pp->ID, 'last_update_time', true)),
                    'active'             => false // Price tables strictly default to inactive per user instructions
                );
            }
        }

        // Fallback: If no posts with post_type 'price' exist yet, derive tables from product_cat
        if (empty($price_tables) && !empty($categories)) {
            foreach ($categories as $ct) {
                $price_tables[] = array(
                    'id'                 => $ct['id'],
                    'destination_id'     => $ct['id'],
                    'name'               => $ct['name'],
                    'slug'               => $ct['slug'],
                    'factory_id'         => 0,
                    'factory_name'       => '',
                    'category_id'        => $ct['id'],
                    'category_name'      => $ct['name'],
                    'assignment_mode'    => 'TAXONOMY',
                    'manual_product_ids' => array(),
                    'product_by_attr'    => array(),
                    'active'             => false
                );
            }
        }

        // 4. Query Products Count & Paginated Items
        $count_query = new WP_Query(array(
            'post_type'      => array('product', 'product_variation'),
            'post_status'    => array('publish', 'draft', 'pending'),
            'posts_per_page' => 1,
            'fields'         => 'ids'
        ));
        $total_found = $count_query->found_posts;
        $total_pages = $total_found > 0 ? ceil($total_found / $per_page) : 1;

        $products = array();
        $query_args = array(
            'post_type'      => array('product', 'product_variation'),
            'post_status'    => array('publish', 'draft', 'pending'),
            'posts_per_page' => $per_page,
            'paged'          => $page,
            'orderby'        => 'ID',
            'order'          => 'ASC'
        );

        $posts = get_posts($query_args);
        foreach ($posts as $post) {
            $post_id = $post->ID;
            $sku = get_post_meta($post_id, '_sku', true);
            $reg_price = get_post_meta($post_id, '_regular_price', true);
            $curr_price = get_post_meta($post_id, '_price', true);
            $price = !empty($reg_price) ? floatval($reg_price) : (!empty($curr_price) ? floatval($curr_price) : 0);
            $price_status = intval(get_post_meta($post_id, 'price_status', true));
            $price_diff = floatval(get_post_meta($post_id, 'price_diff', true));

            // Determine factory / company
            $factory_name = '';
            $factory_id = 0;
            foreach ($factory_taxonomies as $tax) {
                if (taxonomy_exists($tax)) {
                    $p_terms = wp_get_post_terms($post_id, $tax);
                    if (!empty($p_terms) && !is_wp_error($p_terms)) {
                        $factory_name = html_entity_decode($p_terms[0]->name, ENT_QUOTES, 'UTF-8');
                        $factory_id = $p_terms[0]->term_id;
                        break;
                    }
                }
            }

            // Determine category
            $cat_names = array();
            $primary_cat_name = '';
            $primary_cat_id = 0;
            if (taxonomy_exists('product_cat')) {
                $c_terms = wp_get_post_terms($post_id, 'product_cat');
                if (!empty($c_terms) && !is_wp_error($c_terms)) {
                    foreach ($c_terms as $ct) {
                        if ($ct->slug === 'uncategorized' || $ct->name === 'دسته‌بندی نشده') continue;
                        $dec_name = html_entity_decode($ct->name, ENT_QUOTES, 'UTF-8');
                        $cat_names[] = $dec_name;
                        if (empty($primary_cat_name)) {
                            $primary_cat_name = $dec_name;
                            $primary_cat_id = $ct->term_id;
                        }
                    }
                }
            }

            // Match price table:
            // Priority 1: Check if product was manually placed in a price table via ACF 'products' field
            $matched_table_id = 0;
            $matched_table_name = '';
            $product_assignment_mode = 'TAXONOMY';

            foreach ($price_tables as $pt) {
                if (!empty($pt['manual_product_ids']) && in_array($post_id, $pt['manual_product_ids'])) {
                    $matched_table_id = $pt['id'];
                    $matched_table_name = $pt['name'];
                    $product_assignment_mode = 'MANUAL';
                    break;
                }
            }

            // Priority 2: Fallback to matching by Category & Factory (company)
            if (!$matched_table_id && $primary_cat_id && $factory_id) {
                foreach ($price_tables as $pt) {
                    if ($pt['category_id'] === $primary_cat_id && $pt['factory_id'] === $factory_id) {
                        $matched_table_id = $pt['id'];
                        $matched_table_name = $pt['name'];
                        break;
                    }
                }
            }

            // Priority 3: Fallback to matching by Category only
            if (!$matched_table_id && $primary_cat_id) {
                foreach ($price_tables as $pt) {
                    if ($pt['category_id'] === $primary_cat_id) {
                        $matched_table_id = $pt['id'];
                        $matched_table_name = $pt['name'];
                        break;
                    }
                }
            }

            $products[] = array(
                'post_id'          => $post_id,
                'name'             => html_entity_decode($post->post_title, ENT_QUOTES, 'UTF-8'),
                'sku'              => $sku ? $sku : '',
                'current_price'    => $price,
                'price_status'     => $price_status,
                'price_diff'       => $price_diff,
                'assignment_mode'  => $product_assignment_mode,
                'factory_name'     => $factory_name,
                'factory_id'       => $factory_id,
                'category_name'    => $primary_cat_name,
                'category_id'      => $primary_cat_id,
                'price_table_name' => $matched_table_name,
                'price_table_id'   => $matched_table_id,
                'categories'       => $cat_names,
                'stock_status'     => get_post_meta($post_id, '_stock_status', true) ?: 'instock',
                'active'           => true // Products default to ACTIVE as explicitly requested by user
            );
        }

        $has_more = $page < $total_pages && count($products) > 0;

        return rest_ensure_response(array(
            'success'          => true,
            'page'             => $page,
            'per_page'         => $per_page,
            'total_products'   => $total_found,
            'total_pages'      => $total_pages,
            'has_more'         => $has_more,
            'total_factories'  => count($factories),
            'total_categories' => count($categories),
            'total_tables'     => count($price_tables),
            'factories'        => $factories,
            'categories'       => $categories,
            'price_tables'     => $price_tables,
            'products'         => $products,
            'message'          => "صفحه {$page} از {$total_pages} استخراج شد (" . count($products) . " محصول)."
        ));
    }

    /**
     * Handle Fetch Factories Only
     */
    public function handle_fetch_factories($request) {
        $factories = array();
        if (taxonomy_exists('pa_factory')) {
            $terms = get_terms(array('taxonomy' => 'pa_factory', 'hide_empty' => false));
            if (!is_wp_error($terms) && !empty($terms)) {
                foreach ($terms as $t) {
                    $factories[] = array('id' => $t->term_id, 'name' => $t->name, 'slug' => $t->slug, 'count' => $t->count);
                }
            }
        }
        return rest_ensure_response(array(
            'success'   => true,
            'factories' => $factories,
            'total'     => count($factories)
        ));
    }

    /**
     * Add admin settings page
     */
    public function add_admin_menu() {
        add_options_page(
            'تنظیمات همگام‌ساز قیمت',
            'همگام‌ساز قیمت',
            'manage_options',
            'price-system-sync',
            array($this, 'render_admin_page')
        );
    }

    public function register_settings() {
        register_setting('price_system_settings_group', 'price_system_api_token');
    }

    public function render_admin_page() {
        ?>
        <div class="wrap" dir="rtl">
            <h1>تنظیمات افزونه همگام‌ساز قیمت سیستم جمع‌آوری</h1>
            <form method="post" action="options.php">
                <?php settings_fields('price_system_settings_group'); ?>
                <?php do_settings_sections('price_system_settings_group'); ?>
                <table class="form-table">
                    <tr valign="top">
                        <th scope="row">توکن امنیتی API (Secret Token):</th>
                        <td>
                            <input type="text" name="price_system_api_token" value="<?php echo esc_attr(get_option('price_system_api_token')); ?>" style="width: 400px;" />
                            <p class="description">این توکن باید با توکن تعریف شده در سیستم جمع‌آوری قیمت یکسان باشد.</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button('ذخیره تغییرات'); ?>
            </form>
        </div>
        <?php
    }
}

new PriceSystemSyncPlugin();
