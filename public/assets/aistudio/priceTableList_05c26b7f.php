<?php
$obj = get_queried_object();
if ( $obj instanceof WP_Post ) {
	$acfRef = $obj->ID;
	$objID  = $obj->ID;
	$type   = 'price';
	$stax   = 'product_cat';
} else {

	$objID  = $obj->term_id;
	$type   = $obj->taxonomy;
	$stax   = $obj->taxonomy == 'product_cat' ? 'company' : 'product_cat';
	$acfRef = $obj->taxonomy . '_' . $obj->term_id;
}

$output = generateTableList( $obj );

// Backward-compat: build the legacy single 'list'/'max_pages'/'filters' keys.
$inline_html   = $output['inline'] ?? ( $output['list'] ?? '' );
$template_html = $output['template'] ?? '';
$filters       = $output['filters'] ?? [];
$total_tables  = (int) ( $output['total'] ?? 0 );
$titles        = $output['titles'] ?? [];
$stax_key      = $output['stax'] ?? $stax;
$stax_label    = $output['stax_label'] ?? ( $stax_key == 'product_cat' ? 'محصولات' : 'کارخانه‌ها' );

// Whether the <template> lazy hydration should be active.
$has_lazy = $template_html !== '';

// Build the unified pt-controls block once — it lives in the desktop sidebar
// holder by default and gets moved into the mobile modal via JS when needed.
ob_start();
?>
<div class="pt-controls" id="pt-controls">
	<!-- Active-filter chips (rendered by JS) -->
	<div class="product-filters-chips"></div>

	<?php if ( $titles && count( $titles ) > 1 ) { ?>
		<div class="pt-control-group">
			<div class="pt-control-title"><i class="icon-list"></i> <?= esc_html( $stax_label ) ?></div>
			<select class="pt-quicknav" aria-label="<?= esc_attr( $stax_label ) ?>">
				<option value=""><?= esc_html( $stax_label ) ?> را انتخاب کنید</option>
				<?php foreach ( $titles as $t ) { ?>
					<option value="<?= esc_attr( $t['id'] ) ?>"><?= esc_html( $t['title'] ) ?></option>
				<?php } ?>
			</select>
		</div>
	<?php } ?>

	<div class="pt-control-group">
		<h3 class="pt-control-title"><i class="icon-sort"></i> مرتب‌سازی</h3>
		<select class="pt-sort" aria-label="مرتب‌سازی">
			<option value="">پیش‌فرض</option>
			<option value="price-asc">ارزان‌ترین</option>
			<option value="price-desc">گران‌ترین</option>
			<option value="updated">جدیدترین بروزرسانی</option>
		</select>
	</div>

	<?php
	// تعداد فیلترهای قابل نمایش — برای چیدمان دوستونه؛ اگر فرد باشد،
	// کلاس pt-filters-odd باعث می‌شود اولین فیلتر تمام‌عرض (یک خط کامل) شود.
	$pt_filter_count = 0;
	if ( $filters ) {
		foreach ( $filters as $filter ) {
			if ( ! empty( $filter['label'] ) && $filter['options'] && count( $filter['options'] ) > 1 ) {
				$pt_filter_count++;
			}
		}
	}
	?>
	<form class="product-filters<?= ( $pt_filter_count % 2 ) ? ' pt-filters-odd' : '' ?>" autocomplete="off">
			<?php
			if ( $filters ) {
				foreach ( $filters as $key => $filter ) {
					if ( ! empty( $filter['label'] ) && $filter['options'] && count( $filter['options'] ) > 1 ) {
						$options = $filter['options'];
						natcasesort( $options );
						?>
						<div class="pt-control-group pt-filter-group">
							<div class="pt-filter-options">
									<select class="pt-filter-select" name="<?= esc_attr( $key ) ?>" multiple="multiple"
										data-label="<?= esc_attr( $filter['label'] ) ?>"
										data-placeholder="انتخاب کنید"
										aria-label="<?= esc_attr( $filter['label'] ) ?>">
										<?php
										foreach ( $options as $opkey => $op ) {
											$val  = is_array( $op ) ? ( $op['id'] ?? $opkey ) : $op;
											$name = is_array( $op ) ? ( $op['name'] ?? current( $op ) ) : $op;
											?>
											<option value="<?= esc_attr( $val ) ?>"><?= esc_html( $name ) ?></option>
											<?php
										}
										?>
									</select>
								</div>
						</div>
						<?php
					}
				}
			}
			?>
		</form>
</div>
<?php
$pt_controls_html = ob_get_clean();
?>
<div class="container">
	<?php if ( function_exists( 'rank_math_the_breadcrumbs' ) ) {
		rank_math_the_breadcrumbs();
	} ?>

    <div class="row">
        <div class="col-lg-19">
			<?php
			$topDesc = get_field( 'top_desc', $acfRef );
			if ( $topDesc ) {
				?>
                <div class="box box__pad"><?= $topDesc ?></div>
				<?php
			}
			?>

            <div class="sec">
                <div class="sec_right">
                    <h1 class="sec_title">
                        <i class="icon-ahaninja"></i>
						<?= $obj->name ?? $obj->post_title ?>
                    </h1>
                </div>
            </div>

				<?php
				/* ---- نوار خلاصه قیمت: بیشترین/کمترین/میانگین + بروزرسانی (کاملا داینامیک از محصولات همین صفحه) ---- */
				include 'priceSummary.php';
				?>

			<?php
			/* ---- نوار لینک‌های سریع (چیپ‌های فهرست‌محور) — بالای جداول قیمت ---- */
			include 'quickLinks.php';
			?>

				<?php /* ---- Mobile filter/sort floating button (only visible < 992px) ---- */ ?>
            <button type="button" class="pt-filter-toggle" data-modal-trigger="pt-filters">
                <i class="icon-funnel"></i>
                <span class="pt-filter-toggle-label">فیلترها</span>
                <span class="pt-filter-count"></span>
            </button>

            <div class="pt-list" data-total="<?= esc_attr( $total_tables ) ?>"
                 data-type="<?= esc_attr( $type ) ?>"
                 data-id="<?= esc_attr( $objID ) ?>"
                 data-stax="<?= esc_attr( $stax_key ) ?>"
                 data-per-load="<?= esc_attr( S7N_PRICE_TABLE_PER_LOAD ) ?>"
                 data-initial="<?= esc_attr( S7N_PRICE_TABLE_INITIAL ) ?>">
				<?= $inline_html ?>
                <div class="pt-sentinel" aria-hidden="true"></div>
            </div>
			<?php if ( $has_lazy ) { ?>
                <template id="pt-rest" data-count="<?= esc_attr( $total_tables - S7N_PRICE_TABLE_INITIAL ) ?>">
					<?= $template_html ?>
                </template>
                <noscript>
                    <div class="pt-noscript-fallback">
						<?= $template_html ?>
                    </div>
                </noscript>
			<?php } ?>
			<?php
			if ( $obj instanceof WP_Post ) {
				$desc = get_the_content( $obj->ID );
			} else {
				$desc = term_description( $obj->term_id );
			}
			if ( $desc ) {
				?>
                <div class="content box content__more content__height">
                    <div class="content_body content-style">
						<?= $desc ?>
                    </div>
                    <div class="content_more">
                        <span>بیشتر<i class="icon-chevron-down"></i></span>
                    </div>
                </div>
				<?php
			}
			include 'faq.php';

			// باکس پادکست — بلافاصله زیر سوالات متداول
			include get_template_directory() . '/partials/general/podcastPlayer.php';

			// کال تو اکشن استعلام فوری قیمت و مشاوره کارشناس فروش
			include get_template_directory() . '/partials/general/ctaConsultation.php';

			//			tc_taxonomy_comments_list( $obj->term_id, $obj->taxonomy );
			//			tc_taxonomy_comment_form( $obj->term_id, $obj->taxonomy );

			/* بخش نظرات زیر سوالات متداول: single-price روی خود پست، آرشیو product_cat روی پست سایه‌ی ترم */
			$ahaninja_comment_target = 0;
			if ( is_singular( 'price' ) ) {
				$ahaninja_comment_target = (int) get_the_ID();
			} elseif ( is_tax( 'product_cat' ) ) {
				$ahaninja_comment_target = ahaninja_get_term_comment_post( get_queried_object() );
			}
			if ( $ahaninja_comment_target ) {
				include get_template_directory() . '/partials/general/commentsSection.php';
			}
			unset( $ahaninja_comment_target );

			?>
        </div>
        <div class="col-lg-5">
			<?php /* ---- Two-direction sticky wrapper: scrolling down pins the sidebar's
			       bottom edge to the viewport bottom; scrolling up pins its top below
			       the sticky header. Anchoring is driven by .pt-stick-end (JS). ---- */ ?>
			<div class="pt-sidebar">
				<?php ahaninja_the_sidebar_banners( 'price_filters_top' ); ?>

				<?php /* ---- Desktop holder for pt-controls (JS moves the block to the modal on mobile) ---- */ ?>
				<div id="pt-controls-desktop" class="box pt-controls-wrapper">
					<?= $pt_controls_html ?>
				</div>

				<?php ahaninja_the_sidebar_banners( 'price_experts_top' ); ?>

            <div class="box ">
                <div class="box_title experts_box_title">
                    <i class="icon-users"></i>
                    مشاوران شما
					<?php
					// فلش‌های ناوبری مشاوران — کنار عنوان باکس (فقط با بیش از یک مشاور)
					$experts_list = function_exists( 'get_field' ) ? get_field( 'experts', 'option' ) : [];
					if ( is_array( $experts_list ) && count( $experts_list ) > 1 ) :
						?>
                        <div class="experts_nav">
                            <button class="experts_btn expert_prev" aria-label="مشاور قبلی">
                                <i class="icon-chevron-right"></i>
                            </button>
                            <button class="experts_btn expert_next" aria-label="مشاور بعدی">
                                <i class="icon-chevron-left"></i>
                            </button>
                        </div>
					<?php endif; ?>
                </div>
				<?php
				include 'experts.php';
				?>
            </div>

			<?php ahaninja_the_sidebar_banners( 'price_carry_top' ); ?>

			<?php
			/* باکس سبک محاسبه کرایه حمل (مراکز استان) — زیر کارشناسان فروش */
				include 'carrySidebar.php';
				?>

			<?php ahaninja_the_sidebar_banners( 'price_carry_bottom' ); ?>
        </div>
			</div>
		</div>
</div>

<?php /* ---- Mobile-only modal: always in DOM, hidden on desktop via CSS. ---- */ ?>
<div class="modal pt-filters-modal" id="pt-filters" aria-hidden="true">
    <div class="modal_overlay" tabindex="-1" data-modal-close></div>
    <div class="modal_container" role="dialog" aria-modal="true" aria-labelledby="pt-filters">
        <div class="modal_header">
            <div class="modal_title">فیلتر و مرتب‌سازی</div>
            <button type="button" class="modal_close" aria-label="بستن" data-modal-close></button>
        </div>
        <div class="modal_content" id="pt-filters-content">
			<?php /* pt-controls gets moved here by JS when the viewport is mobile. */ ?>
        </div>
        <div class="modal_footer pt-filters-footer">
            <button type="button" class="pt-clear-filters">حذف همه فیلترها</button>
            <button type="button" class="modal_btn modal_btn-primary" data-modal-close>
                نمایش نتایج (<span class="pt-results-count">۰</span>)
            </button>
        </div>
    </div>
</div>
