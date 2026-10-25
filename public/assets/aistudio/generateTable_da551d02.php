<?php
function generateTable($dataTable, $showTitle)
{

    ob_start();
?>
    <table class="product-table" data-special="<?= $dataTable['special']; ?>">
        <thead>
            <tr class="product-table_head">
                <?php if ($showTitle) {
                ?>
                    <th data-priority="1" class="product-title-th">نام محصول</th>
                    <?php
                }
                if ($dataTable['thead']) {
                    foreach ($dataTable['thead'] as $attr) {
                    ?>
                        <th class="<?= $attr ?>"><?= wc_attribute_label($attr) ?></th>
                <?php
                    }
                }
                ?>
                <!-- <th>تاریخ بروزرسانی<i></i></th> -->
                <th data-priority="2" class="price-col"><span class="price-th"> قیمت<i class="icon-toman"></i></span></th>
                <th data-priority="3">نوسان</th>
                <th class="exclude" data-priority="4"></th>
            </tr>
        </thead>
        <tbody>
            <?= $dataTable['tbody']; ?>
        </tbody>
    </table>
<?php
    $output = ob_get_contents();
    ob_end_clean();
    return $output;
}
