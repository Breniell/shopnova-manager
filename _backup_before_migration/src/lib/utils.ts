import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatFCFA = (amount: number): string => {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
}

export const formatDateLong = (date: Date): string => {
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export const formatDateShort = (date: Date): string => {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const generateEAN13 = (): string => {
  let code = '690';
  for (let i = 0; i < 9; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return code + checkDigit;
}

export const generateSaleId = (count: number): string => {
  const year = new Date().getFullYear();
  return `SHP-${year}-${String(count).padStart(5, '0')}`;
}

export const getStockStatus = (current: number, threshold: number): 'ok' | 'low' | 'out' => {
  if (current <= 0) return 'out';
  if (current <= threshold) return 'low';
  return 'ok';
}

