<?php
function generateDataTable(
    $priceTable,
    $obj,
    $filters,
    $showTitle,
    $product_options,
    $theStax = null,
    $attrs = null,
) {
    $cacheVersion = (int) get_post_meta($priceTable->ID, '_price_table_cache_v', true);
    if ($cacheVersion < 1) {
        $cacheVersion = 1;
    }
    // تیک «عدم نمایش محصولات تماس بگیرید»: روی خود جدول یا روی دسته‌بندی/کارخانه جاری
    $hideCallPrice = (bool) get_field('hide_call_price', $priceTable->ID);
    if ($obj instanceof WP_Term) {
        $hideCallPrice = $hideCallPrice || (bool) get_field('hide_call_price', $obj->taxonomy . '_' . $obj->term_id);
    }
    $cacheContext = [
        'showTitle' => (bool) $showTitle,
        'hide_call' => $hideCallPrice,
        'obj' => $obj ? [
            'taxonomy' => $obj->taxonomy ?? null,
            'term_id' => $obj->term_id ?? null,
            'parent' => $obj->parent ?? null,
        ] : null,
        'attrs' => $attrs,
        'filters' => $filters,
        'theStax' => is_array($theStax) ? array_map(function ($term) {
            return $term->term_id ?? null;
        }, $theStax) : null,
    ];
    $cacheContextHash = md5(wp_json_encode($cacheContext));
    $cacheKey = 'price_' . $priceTable->ID . '_v' . $cacheVersion . ($showTitle ? '_title_' : '_notitle_') . $cacheContextHash;
    $cacheGroup = 'price_table';
    $cacheTtl = 10 * MINUTE_IN_SECONDS;
	// Use transients (DB-persistent) instead of wp_cache_* (request-only without
	// a persistent object-cache drop-in). When a drop-in IS present, WP routes
	// transients through it too — so this is correct in all setups.
	$output = get_transient($cacheKey);
	if (false === $output) {
        $company = get_the_terms($priceTable->ID, 'company');
        $productCat = get_the_terms($priceTable->ID, 'product_cat');
        if($company){
	        $theStax = $company;
        }
        $products = get_field('products', $priceTable->ID);
        $logo = getPriceLogo($priceTable->ID, $theStax[0]->term_id ?? null, $obj->term_id ?? null);
        $table = [];
        if ($products) {
            $products = array_column($products, 'products_product');
        }
        if (!$products) {
            if(have_rows('product_by_attr', $priceTable->ID)){
	            $product_by_attr_company = get_field('product_by_attr_company', $priceTable->ID);
                $args = [
                    'post_type' => 'product',
                    'posts_per_page' => -1,
                ];
                if( ! $obj instanceof WP_Post || $product_by_attr_company) {
	                if ( $company ) {
		                $args['tax_query'][] = [
			                'taxonomy' => 'company',
			                'field'    => 'term_id',
			                'terms'    => $company[0]->term_id
		                ];
	                }
                }
	            if ($productCat){
		            foreach ($productCat as $term) {
			            $args['tax_query'][] = [
				            'taxonomy' => $term->taxonomy,
				            'field' => 'term_id',
				            'terms' => $term->term_id
			            ];
		            }
	            }
	            while(have_rows('product_by_attr', $priceTable->ID)){
                    the_row();
                    $product_by_attr_taxonomy = get_sub_field('taxonomy');
                    $product_by_attr_term = get_sub_field('term');
                    if($product_by_attr_taxonomy && $product_by_attr_term){
                        $product_by_attr_term = explode(',', $product_by_attr_term);
                        $args['tax_query'][] = [
                            'taxonomy' => $product_by_attr_taxonomy,
                            'field' => 'term_id',
                            'terms' => $product_by_attr_term
                        ];
                    }
                }
	            $productsQuery = new WP_Query($args);
                if ($productsQuery->have_posts()) {
                    $products = $productsQuery->posts;
                }
                wp_reset_postdata();
                wp_reset_query();
            }
        }
        if (!$products) {
            $args = [
                'post_type' => 'product',
                'posts_per_page' => -1,
            ];

            if ( $company ) {
                $args['tax_query'][] = [
                    'taxonomy' => 'company',
                    'field'    => 'term_id',
                    'terms'    => $company[0]->term_id
                ];
            }
            if ($productCat){
		        foreach ($productCat as $term) {
			        $args['tax_query'][] = [
				        'taxonomy' => $term->taxonomy,
				        'field' => 'term_id',
				        'terms' => $term->term_id
			        ];
		        }
	        }

            $productsQuery = new WP_Query($args);
            if ($productsQuery->have_posts()) {
                $products = $productsQuery->posts;
            }

            wp_reset_postdata();
            wp_reset_query();
        }
        // حذف محصولاتی که قیمت ندارند (ردیف «تماس بگیرید») — شرط دقیقاً همان شرط نمایش ردیف است
        if ($hideCallPrice && $products) {
            $products = array_values(array_filter($products, function ($p) {
                $row_post = $p instanceof WP_Post ? $p : get_post($p);
                if (!$row_post) {
                    return false;
                }
                $row_product = wc_get_product($row_post->ID);

                return $row_product && $row_product->get_price();
            }));
        }
        $generateTableRow = generateTableRow($products, $showTitle, $attrs, $priceTable, $filters, $obj);
        $generateTableRow = $generateTableRow ? $generateTableRow : [];
        $table = array_merge($generateTableRow ?? [], $table);

        $output = [
            'logo' => $logo,
            'tbody' => $table['tbody'],
            'thead' => $table['thead'],
            'special' => $table['special'],
            'filters' => $table['filters']
        ];
        wp_cache_set($cacheKey, $output, $cacheGroup, $cacheTtl);
        set_transient($cacheKey, $output, $cacheTtl);
    }
    return $output;
}

	function generateTableRow($products, $showTitle = false, $attrs = null, $priceTable = null, $filters = null, $obj = null)
{
	if ($products) {
			ob_start();
			$tableAttrs = [];
			$chartingPrice = new Charting_price_Admin();
			$attrSpecialIndex = null;
			// Cross-table taxonomy (company on product_cat pages, product_cat on company pages).
			// Set by generateTableList() so each <tr> can carry its term ids for JS filtering.
			$ptStax      = get_query_var('ptStax');
			$ptStaxTerms = get_query_var('ptStaxTerms');
			// Resolve the stax term ids for THIS price table (fallback to table's own terms).
			$staxTermIds = [];
			if ($ptStax && $priceTable) {
				$terms = !empty($ptStaxTerms) ? $ptStaxTerms : get_the_terms($priceTable->ID, $ptStax);
				if ($terms && !is_wp_error($terms)) {
					foreach ($terms as $term) {
						$staxTermIds[] = $term->term_id;
					}
				}
			}
			$staxDataAttr = ($ptStax && $staxTermIds) ? ' data-' . esc_attr($ptStax) . '="' . esc_attr(implode(',', $staxTermIds)) . '"' : '';
			$rowIndex = 0;
			foreach ($products as $product) {
			$post = $product;
			$post_id = $post->ID;
			$product = wc_get_product($post_id);
			$price = $product->get_price();
			$price_status = get_post_meta($post_id, 'price_status', true);
			$price_diff = get_post_meta($post_id, 'price_diff', true);
			?>
            <tr id="pt<?= $priceTable?->ID ?? rand(100, 999) ?>p<?= $post_id ?>" data-initial-row="<?= $rowIndex ?>"<?= $staxDataAttr ?>>

                <?php if ($showTitle) {
                ?>
                    <td class="product-title">
                            <?= $post->post_title ?>
                    </td>
                    <?php
                }
                $pattrs = $attrs;
                // $pattrs = null;
                if (!$attrs) {
                    if ($priceTable) {

                        $pattrs = get_field('attrs', $priceTable->ID);
                        if (!$pattrs && $obj) {
                            $pattrs = get_field('attrs', $obj->taxonomy . '_' . $obj->term_id);
                            if (!$pattrs && $obj->parent) {
                                $pattrs = get_field('attrs', $obj->taxonomy . '_' . $obj->parent);
                            }
                        }
                    }
                    if ($pattrs) {
                        foreach ($pattrs as $pakey => $attr) {
                            $attrSpecial = $attr['attrs_special'];
                            if($attr['attrs_special']){
	                            $attrSpecialIndex = $pakey;
                            }
                            $attr =  'pa_' . $attr['attrs_attr'];
                            if (!in_array($attr, $tableAttrs)) {
                                $tableAttrs[] = $attr;
                            }
                            $pattr = $product->get_attribute($attr);
                            if (isset($filters[$attr]) && !array_key_exists($attr, $filters[$attr]['options'])) {
                                $filters[$attr]['options'][$pattr] = $pattr;
                            } else {
                                $filters[$attr]['label'] = wc_attribute_label($attr);
                                $filters[$attr]['options'][$pattr] = $pattr;
                            }
                            // if (!array_key_exists($attr, $filters[$attr]['options'])) {
                            //     $product_attributes = $product->get_attributes();
                            //     $product_options = $product_attributes[$attr]->get_data();
                            //     if ($product_options['options']) {
                            //         foreach ($product_options['options'] as $op) {
                            //             if (!array_key_exists($op, $filters[$attr]['options'])) {
                            //                 $filters[$attr]['options'][$op] = $product->get_attribute($attr);
                            //             }
                            //         }
                            //     }
                            // }
                    ?>
                            <td>
                                <?php
                                if (!$attrSpecial) {
                                    echo $pattr ?: '-';
                                } else {
                                ?>
                                    <span class="price-special"><?= $pattr ?: '-' ?></span>
                                <?php
                                }
                                ?>
                            </td>
                            <?php
                        }
                    } else {
                        $pattrs = $product->get_attributes();
                        if ($pattrs) {
                            $pattrs = array_keys($pattrs);
                            $tableAttrs = $tableAttrs + $pattrs;
                            foreach ($pattrs as $attr) {
                            ?>
                                <td><?= $product->get_attribute($attr) ?: '-' ?></td>
                <?php
                            }
                        }
                    }
                }
                ?>
                <!-- <td class="ltr">
                <?= $chartingPrice->get_last_updated_time($post_id) ?>
            </td> -->
                <?php
                $priceNoTax = $price ? ceil($price / 1.1) : '';
                ?>
                <td data-order="<?= $price ? $priceNoTax : 999999999 ?>">
                    <div class="product-price" data-price="<?= $priceNoTax ?>" data-taxprice="<?= $price ?>">
                        <?= $price ? number_format($priceNoTax) : '<span class="product-call">تماس بگیرید</span>' ?>
                    </div>
                </td>
                <td>
                    <div class="price-status <?= $price_status != '0' ? ($price_status == '1' ? 'price-status__down' : 'price-status__up') : '' ?>">
                        <?php
                        if (!$price || $price_status == 0) {
                        ?>
                            ثابت
                        <?php
                        } else {
                            if ($price_status == 1) {
                                echo '<i class="icon-minus-small"></i>';
                                echo $price_diff;
                                echo '<i class="icon-arrow-trending-down"></i>';
                            } elseif ($price_status == 2) {
                                echo '<i class="icon-plus-small"></i>';
                                echo $price_diff;
                                echo '<i class="icon-arrow-trending-up"></i>';
                            } else {
                                echo 'ثابت';
                            }
                        }
                        ?>
                    </div>
                </td>
                <td class="exclude">
                    <button data-modal-trigger="chart" class="price-opt price-chart" aria-label="مشاهده نمودار قیمت" data-tooltip="مشاهده نمودار قیمت"
                            data-title="<?= $post->post_title ?>" data-id="<?= $post_id ?>" data-type="product"><i class="icon-bar-chart"></i></button>
                    <!--                            <i class="product-table_btn icon-cart product-table_cart"></i>-->
                </td>
            </tr>
<?php
	        $rowIndex++;
        }
        $tbody = ob_get_contents();
        ob_end_clean();
        return [
            'tbody' => htmlMinfy($tbody),
            'thead' => $tableAttrs,
            'filters' => $filters ?? null,
            'special' => $attrSpecialIndex,
        ];
    }
    return false;
}

function price_table_bump_cache_version($price_table_id)
{
    $current = (int) get_post_meta($price_table_id, '_price_table_cache_v', true);
    if ($current < 1) {
        $current = 1;
    }
    update_post_meta($price_table_id, '_price_table_cache_v', $current + 1);
}
