import type { MobileOperator } from '@/stores/useSaleStore';

/** A valid MoMo reference: at least 6 non-whitespace characters when trimmed. */
export function isValidMomoRef(ref: string): boolean {
  return ref.trim().length >= 6;
}

/**
 * Returns the USSD dialling string the customer must enter to pay.
 * MTN MoMo Cameroon : *126*4*<code>*<amount>#
 * Orange Money Cameroon : #150*4*<code>*<amount>#
 */
export function momoDialString(operator: MobileOperator, code: string, amount: number): string {
  if (operator === 'mtn') return `*126*4*${code}*${amount}#`;
  return `#150*4*${code}*${amount}#`;
}

export interface CanValidateMomoOpts {
  mobileOperator: MobileOperator;
  momoMerchantCode: string | undefined;
  confirmationReceived: boolean;
  mobileRef: string;
}

/**
 * True only when all four conditions for a valid MoMo payment are met:
 * 1. Operator selected
 * 2. Merchant code configured in Settings
 * 3. Cashier confirmed receipt of the SMS
 * 4. Reference is long enough (≥ 6 chars)
 */
export function canValidateMomo(opts: CanValidateMomoOpts): boolean {
  return (
    !!opts.mobileOperator &&
    !!(opts.momoMerchantCode ?? '').trim() &&
    opts.confirmationReceived &&
    isValidMomoRef(opts.mobileRef)
  );
}
