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
</html>`
};
