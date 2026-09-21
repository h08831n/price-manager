// Jalali & Persian Freshness Detection Engine

// Normalize Persian and Arabic digits to standard ASCII digits
export function toAsciiDigits(str: string): string {
  if (!str) return '';
  return str
    .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1776 + 48))
    .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1632 + 48));
}

// Convert Gregorian date to Jalali (Solar Hijri)
export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = (gy <= 1600) ? 0 : 979;
  gy -= (gy <= 1600) ? 621 : 1600;
  const gy2 = (gm > 2) ? (gy + 1) : gy;
  let days = (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100)
    + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm: number;
  let jd: number;
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }
  return [jy, jm, jd];
}

const PERSIAN_MONTHS: Record<string, number> = {
  'فروردین': 1,
  'اردیبهشت': 2,
  'خرداد': 3,
  'تیر': 4,
  'مرداد': 5,
  'شهریور': 6,
  'مهر': 7,
  'آبان': 8,
  'آذر': 9,
  'دی': 10,
  'بهمن': 11,
  'اسفند': 12
};

export interface FreshnessResult {
  raw_text: string;
  normalized_date: string | null;
  normalized_time: string | null;
  fresh: boolean;
  reason: string;
}

export function evaluateFreshness(rawText: string, referenceDate: Date = new Date()): FreshnessResult {
  if (!rawText || !rawText.trim()) {
    return {
      raw_text: '',
      normalized_date: null,
      normalized_time: null,
      fresh: false,
      reason: 'متن تاریخ خالی است'
    };
  }

  const cleanText = toAsciiDigits(rawText.trim());

  // Extract time if present (e.g. 10:42 or 10:42:00)
  const timeMatch = cleanText.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const normalized_time = timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : null;

  // Compute Today in Tehran / reference date
  const [todayJy, todayJm, todayJd] = gregorianToJalali(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    referenceDate.getDate()
  );
  const todayJalaliStr = `${todayJy}/${String(todayJm).padStart(2, '0')}/${String(todayJd).padStart(2, '0')}`;
  const todayGregorianStr = referenceDate.toISOString().split('T')[0];

  // 1. Check for explicit "دیروز" (Yesterday)
  if (/دیروز|yesterday/i.test(cleanText)) {
    return {
      raw_text: rawText,
      normalized_date: 'yesterday',
      normalized_time,
      fresh: false,
      reason: 'تاریخ متعلق به دیروز است'
    };
  }

  // 2. Check for explicit "امروز" (Today)
  if (/امروز|today/i.test(cleanText)) {
    return {
      raw_text: rawText,
      normalized_date: todayJalaliStr,
      normalized_time,
      fresh: true,
      reason: 'عبارت «امروز» در تاریخ منبع ثبت شده است'
    };
  }

  // 3. Numeric Jalali date pattern: YYYY/MM/DD or YYYY-MM-DD
  const jalaliNumericMatch = cleanText.match(/(1[34]\d{2})[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](3[01]|[12]\d|0?[1-9])\b/);
  if (jalaliNumericMatch) {
    const y = parseInt(jalaliNumericMatch[1], 10);
    const m = parseInt(jalaliNumericMatch[2], 10);
    const d = parseInt(jalaliNumericMatch[3], 10);
    const normalized = `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
    const isToday = (y === todayJy && m === todayJm && d === todayJd);
    return {
      raw_text: rawText,
      normalized_date: normalized,
      normalized_time,
      fresh: isToday,
      reason: isToday ? 'تاریخ جلالی با امروز مطابقت دارد' : `تاریخ منبع (${normalized}) متعلق به گذشته است`
    };
  }

  // 4. Persian named month pattern: e.g. "31 شهریور 1405" or "1 مهر"
  for (const [monthName, monthNum] of Object.entries(PERSIAN_MONTHS)) {
    if (cleanText.includes(monthName)) {
      const dayMatch = cleanText.match(new RegExp(`(\\d{1,2})\\s*${monthName}`));
      const yearMatch = cleanText.match(/(1[34]\d{2})/);
      const day = dayMatch ? parseInt(dayMatch[1], 10) : null;
      const year = yearMatch ? parseInt(yearMatch[1], 10) : todayJy;

      if (day) {
        const normalized = `${year}/${String(monthNum).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
        const isToday = (year === todayJy && monthNum === todayJm && day === todayJd);
        return {
          raw_text: rawText,
          normalized_date: normalized,
          normalized_time,
          fresh: isToday,
          reason: isToday ? 'تاریخ متنی جلالی با امروز مطابقت دارد' : `تاریخ منبع (${normalized}) متعلق به گذشته است`
        };
      }
    }
  }

  // 5. Gregorian date pattern: YYYY-MM-DD or YYYY/MM/DD
  const gregMatch = cleanText.match(/(20\d{2})[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](0?[1-9]|[12]\d|3[01])/);
  if (gregMatch) {
    const y = parseInt(gregMatch[1], 10);
    const m = parseInt(gregMatch[2], 10);
    const d = parseInt(gregMatch[3], 10);
    const normalized = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = (normalized === todayGregorianStr);
    return {
      raw_text: rawText,
      normalized_date: normalized,
      normalized_time,
      fresh: isToday,
      reason: isToday ? 'تاریخ میلادی با امروز مطابقت دارد' : `تاریخ میلادی (${normalized}) متعلق به امروز نیست`
    };
  }

  // Fallback if unable to parse
  return {
    raw_text: rawText,
    normalized_date: null,
    normalized_time,
    fresh: false,
    reason: 'فرمت تاریخ قابل شناسایی نبود'
  };
}
