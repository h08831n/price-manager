// Simulated competitor websites for local hermetic testing and verification
// Supports static table, click-to-show, delayed, scroll, multiple tables per page, Jalali dates, and today/yesterday text

export const FIXTURE_PAGES: Record<string, string> = {
  // Source A: Updated today, standard table with Zobahan rebar
  'source-a.html': `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>سایت منبع الف - قیمت آهن‌آلات</title>
  <style>
    body { font-family: sans-serif; padding: 20px; background: #fafafa; }
    .update-box { background: #e8f5e9; padding: 10px; border-radius: 6px; margin-bottom: 20px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #ddd; }
    th, td { padding: 10px; border: 1px solid #ddd; text-align: right; }
    th { background: #f0f0f0; }
  </style>
</head>
<body>
  <h2>مرکز قیمت‌گذاری منبع الف</h2>
  <div class="update-box" id="last-update">امروز ۱۰:۴۲</div>
  
  <h3>جدول میلگرد ذوب آهن اصفهان</h3>
  <table id="zobahan-table">
    <thead>
      <tr>
        <th>ردیف</th>
        <th>محصول</th>
        <th>سایز</th>
        <th>کارخانه</th>
        <th>قیمت (تومان)</th>
        <th>وضعیت</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>میلگرد 12 ذوب آهن</td>
        <td>12</td>
        <td>ذوب آهن</td>
        <td class="price">58,000</td>
        <td>موجود</td>
      </tr>
      <tr>
        <td>2</td>
        <td>میلگرد 14 ذوب آهن</td>
        <td>14</td>
        <td>ذوب آهن</td>
        <td class="price">58,400</td>
        <td>موجود</td>
      </tr>
      <tr>
        <td>3</td>
        <td>میلگرد 16 ذوب آهن</td>
        <td>16</td>
        <td>ذوب آهن</td>
        <td class="price">59,100</td>
        <td>موجود</td>
      </tr>
      <tr>
        <td>4</td>
        <td>میلگرد 18 ذوب آهن</td>
        <td>18</td>
        <td>ذوب آهن</td>
        <td class="price">60,100</td>
        <td>موجود</td>
      </tr>
    </tbody>
  </table>
</body>
</html>`,

  // Source B: Updated today, slightly cheaper on some sizes
  'source-b.html': `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>سایت منبع ب - بورس آهن</title>
  <style>
    body { font-family: sans-serif; padding: 20px; background: #fdfdfd; }
    .status-badge { color: #2e7d32; font-size: 14px; margin-bottom: 15px; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #ccc; }
    th, td { padding: 8px 12px; border: 1px solid #eee; }
  </style>
</head>
<body>
  <h2>بورس فلزات منبع ب</h2>
  <div class="status-badge" id="source-b-update">امروز - بروزرسانی ۱۱:۰۲</div>

  <table id="prices-b">
    <tbody>
      <tr data-id="rebar-12">
        <td>میلگرد ۱۲</td>
        <td>ذوب آهن</td>
        <td class="val">۵۷,۸۰۰</td>
      </tr>
      <tr data-id="rebar-14">
        <td>میلگرد ۱۴</td>
        <td>ذوب آهن</td>
        <td class="val">۵۸,۲۰۰</td>
      </tr>
      <tr data-id="rebar-16">
        <td>میلگرد ۱۶</td>
        <td>ذوب آهن</td>
        <td class="val">۵۹,۲۰۰</td>
      </tr>
      <tr data-id="rebar-18">
        <td>میلگرد ۱۸</td>
        <td>ذوب آهن</td>
        <td class="val">۶۰,۵۰۰</td>
      </tr>
    </tbody>
  </table>
</body>
</html>`,

  // Source C: Not updated in morning (shows دیروز), then updated at second attempt
  'source-c.html': `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>سایت منبع ج - بازرگانی فولاد</title>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    .date-label { color: #d32f2f; font-weight: bold; margin-bottom: 12px; }
  </style>
</head>
<body>
  <h2>بازرگانی فولاد منبع ج</h2>
  <div class="date-label" id="update-date-c">دیروز ۱۵:۳۰</div>
  
  <table id="tbl-c" border="1">
    <tr><td>میلگرد 12 ذوب آهن</td><td class="p">57,500</td></tr>
    <tr><td>میلگرد 14 ذوب آهن</td><td class="p">58,100</td></tr>
    <tr><td>میلگرد 16 ذوب آهن</td><td class="p">58,900</td></tr>
    <tr><td>میلگرد 18 ذوب آهن</td><td class="p">59,800</td></tr>
  </table>
</body>
</html>`,

  // Source D: Updated today with Jalali full date (e.g. 1405/06/31 or today's current Jalali date)
  'source-d.html': `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>سایت منبع د - آهن‌مارکت</title>
</head>
<body>
  <h2>آهن‌مارکت منبع د</h2>
  <div id="meta-update" class="info-date">امروز ساعت ۱۰:۵۵</div>
  
  <table id="d-prices" border="1">
    <tr><th>نام کالا</th><th>فی (تومان)</th></tr>
    <tr><td>میلگرد 12 ذوب</td><td>58,100</td></tr>
    <tr><td>میلگرد 14 ذوب</td><td>58,600</td></tr>
    <tr><td>میلگرد 16 ذوب</td><td>58,950</td></tr>
    <tr><td>میلگرد 18 ذوب</td><td>60,000</td></tr>
  </table>
</body>
</html>`,

  // Source E: Not updated (stale from last week)
  'source-e.html': `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>سایت منبع هـ</title>
</head>
<body>
  <h2>منبع هـ</h2>
  <div id="date-e">1403/10/12</div>
  <table id="table-e">
    <tr><td>میلگرد 12</td><td>56,000</td></tr>
    <tr><td>میلگرد 14</td><td>56,500</td></tr>
  </table>
</body>
</html>`,

  // Interactive page with Click-to-show to test Page Actions (WAIT, CLICK, SCROLL_TO, WAIT_FOR_ELEMENT)
  'interactive-page.html': `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>صفحه تعاملی نیازمند کلیک و اسکرول</title>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    #prices-section { display: none; margin-top: 50px; }
    .spacer { height: 600px; background: #f0f0f0; margin: 20px 0; padding: 20px; }
  </style>
</head>
<body>
  <h2>صفحه آزمایشی Page Actions</h2>
  <div id="interactive-date">امروز ۱۱:۳۰</div>
  <button id="show-prices-btn" onclick="document.getElementById('prices-section').style.display='block';">نمایش قیمت‌های روز</button>

  <div class="spacer">جهت مشاهده جدول اسکرول نمایید...</div>

  <div id="prices-section">
    <h3>جدول بارگذاری شده پس از تعامل</h3>
    <table id="dynamic-prices" border="1">
      <tr><td>میلگرد 12 ذوب</td><td>57,900</td></tr>
      <tr><td>میلگرد 14 ذوب</td><td>58,300</td></tr>
      <tr><td>میلگرد 16 ذوب</td><td>59,050</td></tr>
      <tr><td>میلگرد 18 ذوب</td><td>60,200</td></tr>
    </table>
  </div>
</body>
</html>`,

  // Dynamic Delayed page: Injects prices via setTimeout (Simulates client-side AJAX/SPA load)
  'dynamic-delayed.html': `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>صفحه با بارگذاری تاخیری (AJAX/SPA)</title>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    .loading { color: #f59e0b; font-weight: bold; }
  </style>
</head>
<body>
  <h2>سامانه قیمت با بارگذاری ای‌جکس</h2>
  <div id="ajax-update">امروز ۱۱:۴۵</div>
  <div id="loading-indicator" class="loading">در حال بارگذاری اطلاعات از سرور...</div>
  <div id="async-table-container"></div>

  <script>
    setTimeout(function() {
      var container = document.getElementById('async-table-container');
      var indicator = document.getElementById('loading-indicator');
      if (indicator) indicator.style.display = 'none';
      container.innerHTML = '<table id="async-prices" border="1">' +
        '<thead><tr><th>نام</th><th>قیمت</th></tr></thead>' +
        '<tbody>' +
        '<tr><td>میلگرد 12 ذوب آهن</td><td class="async-val">58,050</td></tr>' +
        '<tr><td>میلگرد 14 ذوب آهن</td><td class="async-val">58,350</td></tr>' +
        '</tbody></table>';
    }, 400);
  </script>
</body>
</html>`,

  // Dynamic Tabs page: Requires clicking a tab to activate and render the table
  'dynamic-tabs.html': `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>صفحه دارای تب‌های قیمتی</title>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    .tab-btn { padding: 8px 16px; margin-right: 4px; cursor: pointer; }
    .tab-content { display: none; padding: 16px; border: 1px solid #ccc; margin-top: 8px; }
    .active-tab { display: block; }
  </style>
</head>
<body>
  <h2>لیست قیمت‌ها در تب‌های مختلف</h2>
  <div id="tabs-date">امروز ۱۲:۱۰</div>
  <div class="tabs-nav">
    <button id="tab-btn-pipe" class="tab-btn" onclick="openTab('pipe')">لوله و پروفیل</button>
    <button id="tab-btn-rebar" class="tab-btn" onclick="openTab('rebar')">میلگرد آجدار</button>
  </div>

  <div id="tab-content-pipe" class="tab-content">
    <p>قیمت لوله‌ها...</p>
  </div>

  <div id="tab-content-rebar" class="tab-content">
    <table id="rebar-tab-table" border="1">
      <tr><td>میلگرد 12 ذوب</td><td class="tab-val">57,950</td></tr>
      <tr><td>میلگرد 14 ذوب</td><td class="tab-val">58,250</td></tr>
    </table>
  </div>

  <script>
    function openTab(tabName) {
      document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('active-tab'); });
      var target = document.getElementById('tab-content-' + tabName);
      if (target) target.classList.add('active-tab');
    }
  </script>
</body>
</html>`,

  // Error page: Used for testing missing selector captures and snapshotting
  'error-page.html': `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>صفحه خطا</title>
</head>
<body>
  <h2>صفحه با ساختار نامتعارف</h2>
  <div class="notice">هیچ جدولی در این صفحه وجود ندارد</div>
</body>
</html>`,

  // Integration Test Fixture: Multi-Product Freshness Evaluation
  'multi-product-freshness.html': `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>تست چند محصولی با تاریخ‌های متفاوت</title>
</head>
<body>
  <h2>جدول قیمت تست چند محصولی</h2>
  <div id="table-date">امروز ۱۰:۳۰</div>
  <table id="products-table" border="1">
    <tr id="row-a">
      <td class="name">Product A</td>
      <td class="date">امروز ۱۰:۳۰</td>
      <td class="price">55,000</td>
    </tr>
    <tr id="row-b">
      <td class="name">Product B</td>
      <td class="date">دیروز ۱۶:۰۰</td>
      <td class="price">56,000</td>
    </tr>
    <tr id="row-c">
      <td class="name">Product C</td>
      <td class="price">57,000</td>
    </tr>
    <tr id="row-d">
      <td class="name">Product D</td>
      <td class="price">58,000</td>
    </tr>
  </table>
</body>
</html>`
};
