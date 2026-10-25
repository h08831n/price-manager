<?php

// if ($products) {
//     $products = array_column($products, 'products_product');
// }

$showTitle = get_query_var('showTitle');
$nolink_title = get_query_var('nolink_title');
$dataTable = generateDataTable($priceTable, $obj, $filters, $showTitle,$product_options, $theStax,null );

if (!empty($dataTable['filters']) && is_array($dataTable['filters'])) {
    // Merge (not replace) so that filters from earlier tables are preserved.
    foreach ($dataTable['filters'] as $fk => $fv) {
        if (!isset($filters[$fk])) {
            $filters[$fk] = $fv;
        } elseif (isset($fv['options']) && is_array($fv['options'])) {
            $filters[$fk]['options'] = ($filters[$fk]['options'] ?? []) + $fv['options'];
        }
    }
}
$logo = getPriceLogo($priceTable->ID, $theStax[0]?->term_id ?? null, $obj?->term_id ?? null);
$_pt_updated = (int) get_post_meta($priceTable->ID, 'last_update_time', true);

?>
<div data-pricetable="<?= $priceTable->ID ?>" class="box product-table-sec" data-updated="<?= esc_attr($_pt_updated) ?>">
    <div class="box_title sticky">
        <?php
        if ($logo) {
        ?>
            <img class="price-logo" src="<?= $logo['sizes']['company-small'] ?>" title="<?= $logo['title'] ?>" alt="<?= $logo['alt'] ?>" />
        <?php
        }
        ?>
        <div class="price-header">
            <?php
                $titleTag = !$nolink_title ? 'a' : 'span';
                // href فقط وقتی معنا دارد که عنوان لینک است؛ روی <span> صفت href نامعتبر است.
                $titleHref = $titleTag === 'a' ? ' href="' . esc_url( get_permalink( $priceTable->ID ) ) . '"' : '';
            ?>
            <div class="price-title">
                <<?= $titleTag ?><?= $titleHref ?>><?= get_the_title($priceTable->ID); ?></<?= $titleTag ?>>
            </div>
            <div class="price-header-bottom">
                <span class="price-time"> <?= !IS_MOB ? 'بروزرسانی: ' : '' ?><?= getPriceDate($priceTable->ID); ?> </span>
                <?php
                if (IS_MOB) {
                ?>
                    <div class="price-tax">
                        <input type="checkbox" id="price_tax_<?= $priceTable->ID ?>" name="price_tax_<?= $priceTable->ID ?>">
                        <label for="price_tax_<?= $priceTable->ID ?>">قیمت با ارزش افزوده</label>
                    </div>

                    <button class="price-btn" aria-label="بیشتر" data-tooltip="بیشتر">
                        <i class="icon-ellipsis-vertical"></i>
                    </button>
                <?php
                }
                ?>
            </div>
        </div>
        <div class="box_title-left">
            <?php
            if (!IS_MOB) {
            ?>
                <div class="price-tax">
                    <input type="checkbox" id="price_tax_<?= $priceTable->ID ?>" name="price_tax_<?= $priceTable->ID ?>">
                    <label for="price_tax_<?= $priceTable->ID ?>">قیمت با ارزش افزوده</label>
                </div>
               <?php
                /* <button class="price-btn" aria-label="اطلاع رسانی" data-tooltip="اطلاع رسانی">
                    <i class="icon-bell-alert"></i>
                </button> */
                ?>
                <button class="price-btn price-print" aria-label="چاپ" data-tooltip="چاپ">
                    <i class="icon-printer"></i>
                </button>
               <?php
                /*
                <button class="price-btn" aria-label="اشتراک گذاری" data-tooltip="اشتراک گذاری">
                    <i class="icon-share"></i>
                </button> */
	            ?>
            <?php
            }
            ?>
        </div>
    </div>
    <div class="box_content tab-content">
        <?= generateTable($dataTable, $showTitle); ?>
    </div>
</div>