// Price Parser Engine
import { toAsciiDigits } from './freshness';

export interface PriceParseResult {
  valid: boolean;
  price: number;
  raw: string;
  error?: string;
}

export function parseProductPrice(rawValue: string | number | null | undefined): PriceParseResult {
  if (rawValue === null || rawValue === undefined) {
    return { valid: false, price: 0, raw: '', error: 'مقدار قیمت خالی است' };
  }

  const rawStr = String(rawValue).trim();
  if (!rawStr) {
    return { valid: false, price: 0, raw: rawStr, error: 'مقدار قیمت خالی است' };
  }

  // Convert Persian and Arabic digits to ASCII
  const ascii = toAsciiDigits(rawStr);

  // Remove common currency and non-numeric labels: تومان, ریال, irr, toman, commas, spaces, etc.
  // Keep only digits and decimal dot
  let cleaned = ascii
    .replace(/[,\s_]/g, '')
    .replace(/(تومان|ریال|toman|rial|irr)/gi, '')
    .trim();

  // Match numeric value
  let numMatch = cleaned.match(/^[-+]?[0-9]+(\.[0-9]+)?$/);

  // If not direct clean number, gracefully strip badge words (بدون تغییر, افزایش, کاهش, etc.)
  if (!numMatch) {
    const stripped = ascii
      .replace(/(بدون تغییر|بدون‌تغییر|ثابت|افزایش|کاهش|تغییر|تماس بگیرید|استعلام|قیمت|تومان|ریال|toman|rial|irr)/gi, ' ')
      .trim();
    const nums = stripped
      .split(/\s+/)
      .map((s) => s.replace(/[,\s_]/g, ''))
      .filter((s) => /^\d+(\.\d+)?$/.test(s));

    if (nums.length > 0) {
      const parsedNums = nums.map((n) => parseFloat(n)).filter((n) => !isNaN(n) && n > 0);
      const mainPrice = parsedNums.find((n) => n >= 1000) || parsedNums[parsedNums.length - 1];
      if (mainPrice) {
        cleaned = String(mainPrice);
        numMatch = cleaned.match(/^[-+]?[0-9]+(\.[0-9]+)?$/);
      }
    }
  }

  if (!numMatch) {
    return {
      valid: false,
      price: 0,
      raw: rawStr,
      error: `مقدار غیر عددی است (${rawStr})`
    };
  }

  const parsedNumber = parseFloat(cleaned);

  if (isNaN(parsedNumber)) {
    return {
      valid: false,
      price: 0,
      raw: rawStr,
      error: 'خطا در تبدیل رشته به عدد'
    };
  }

  if (parsedNumber <= 0) {
    return {
      valid: false,
      price: 0,
      raw: rawStr,
      error: 'قیمت صفر یا منفی مجاز نیست'
    };
  }

  return {
    valid: true,
    price: Math.round(parsedNumber), // Round to nearest integer for standard currency
    raw: rawStr
  };
}
