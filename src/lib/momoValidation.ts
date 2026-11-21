import type { MobileOperator } from '@/stores/useSaleStore';

/** A valid MoMo reference: at least 6 non-whitespace characters when trimmed. */
export function isValidMomoRef(ref: string): boolean {
  return ref.trim().length >= 6;
}

/**
 * Returns the USSD code the customer must dial to start paying the merchant.
 *
 * MTN MoMo Cameroon (mtn.cm) : one string carries everything,
 *   *126*4*<code>*<amount>#
 *
 * Orange Money Cameroon (orangemoney.orange.cm, « Paiement marchand ») : the
 * customer dials the menu #150*47#, then types the merchant code and the
 * amount when prompted, and confirms with their Orange Money secret code.
 * No official one-shot string with code and amount exists, so none is built
 * here: a made-up shortcut would send customers to the wrong menu. `code` and
 * `amount` are therefore ignored for Orange; the steps are spelled out in the
 * `caisse.momoInstructionsOrange` translation instead.
 */
export function momoDialString(operator: MobileOperator, code: string, amount: number): string {
  if (operator === 'mtn') return `*126*4*${code}*${amount}#`;
  return '#150*47#';
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
