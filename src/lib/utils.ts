import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generates an EAN-13 barcode for internal (shop) use.
 *
 * Prefix '2' is globally reserved for in-store/internal use by GS1 — it is
 * never assigned to a real manufacturer. Using '690' (Chinese prefix) was
 * incorrect and could collide with real products.
 *
 * Format: 2 + 11 random digits + 1 EAN-13 check digit = 13 digits total.
 *
 * TODO: if a product lookup API becomes relevant (e.g. Open Food Facts for
 * packaged goods available in Cameroon), it can be plugged in here alongside
 * this generator for the "packaged product" path. No paid API at launch.
 */
export const generateInternalBarcode = (): string => {
  let code = '2';
  for (let i = 0; i < 11; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return code + checkDigit;
};

// Backward-compatible alias — callers that imported generateEAN13 keep working.
export const generateEAN13 = generateInternalBarcode;

/**
 * Validates an EAN-13 barcode string.
 * Checks: exactly 13 digits, correct GS1 check digit.
 */
export const isValidEAN13 = (code: string): boolean => {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10 === parseInt(code[12]);
};

export const generateSaleId = (count: number): string => {
  const year = new Date().getFullYear();
  return `LGW-${year}-${String(count).padStart(5, '0')}`;
};

export const getStockStatus = (current: number, threshold: number): 'healthy' | 'low' | 'stockout' => {
  if (current <= 0) return 'stockout';
  if (current <= threshold) return 'low';
  return 'healthy';
};
