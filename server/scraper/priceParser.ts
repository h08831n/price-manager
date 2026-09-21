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
  const cleaned = ascii
    .replace(/[,\s_]/g, '')
    .replace(/(تومان|ریال|toman|rial|irr)/gi, '')
    .trim();

  // Match numeric value
  const numMatch = cleaned.match(/^[-+]?[0-9]+(\.[0-9]+)?$/);
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
