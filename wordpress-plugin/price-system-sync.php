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

        // Comprehensive Products Sync & Connect Endpoint
        register_rest_route(self::API_NAMESPACE, '/sync-products', array(
            'methods'  => 'POST',
            'callback' => array($this, 'handle_sync_products'),
            'permission_callback' => array($this, 'verify_api_token'),
        ));
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

            // Update WooCommerce standard price fields
            update_post_meta($post_id, '_regular_price', $new_price);
            update_post_meta($post_id, '_price', $new_price);
            update_post_meta($post_id, '_price_system_last_sync', current_time('mysql'));
            update_post_meta($post_id, '_price_system_table_id', $price_table_id);

            // Clear WooCommerce transients
            if (function_exists('wc_delete_product_transients')) {
                wc_delete_product_transients($post_id);
            }

            $updated_count++;
            $results[] = array(
                'post_id'   => $post_id,
                'old_price' => $old_price,
                'new_price' => $new_price,
                'success'   => true
            );
        }

        return rest_ensure_response(array(
            'success'        => true,
            'price_table_id' => $price_table_id,
            'updated'        => $updated_count,
            'failed'         => $failed_count,
            'items'          => $results
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
