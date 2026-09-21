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
