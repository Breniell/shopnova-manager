import React from 'react';
import { cn } from '@/lib/utils';
import { Sale } from '@/stores/useSaleStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { X, Printer } from 'lucide-react';
import { formatPrice, formatFCFA, formatDate, formatTime, formatDateShort } from '@/utils/formatters';
import { useTranslation } from '@/i18n';

interface ReceiptModalProps {
  sale: Sale | null;
  open: boolean;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ sale, open, onClose }) => {
  const { shop } = useSettingsStore();
  const { t } = useTranslation();

  if (!open || !sale) return null;

  const handlePrint = () => window.print();

  const paymentLabel = sale.paymentMode === 'especes'
    ? t('receipt.payEspeces')
    : sale.paymentMode === 'mobile_money'
      ? t('receipt.payMobile')
      : t('receipt.payCredit');

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
        <div className="animate-scale-in" onClick={e => e.stopPropagation()}>
          {/* Receipt */}
          <div className="receipt-print bg-white text-gray-900 w-[320px] rounded-xl overflow-hidden shadow-2xl">
            <div className="p-6 text-center border-b border-dashed -gray-300">
              <h2 className="font-bold text-lg">{shop.nom}</h2>
              <p className="text-xs text-gray-500 mt-1">{shop.adresse}</p>
              <p className="text-xs text-gray-500">{shop.telephone}</p>
              {shop.enteteRecu && <p className="text-xs text-gray-600 mt-2 italic">{shop.enteteRecu}</p>}
            </div>

            <div className="px-6 py-3 border-b border-dashed -gray-300">
              <div className="flex justify-between text-xs text-gray-500">
                <span>{t('receipt.number')}: {sale.saleNumber}</span>
                <span>{formatDateShort(new Date(sale.date))}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{t('receipt.cashier')}: {sale.userName}</span>
                <span>{formatTime(new Date(sale.date))}</span>
              </div>
              {sale.customerName && (
                <div className="text-xs text-gray-600 mt-2 pt-2 border-t border-dashed border-gray-200">
                  <span className="font-medium">{t('receipt.client')} : </span>
                  {sale.customerName}
                </div>
              )}
            </div>

            <div className="px-6 py-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b -gray-200">
                    <th className="text-left py-1 font-medium">{t('receipt.article')}</th>
                    <th className="text-center py-1 font-medium">{t('receipt.qty')}</th>
                    <th className="text-right py-1 font-medium">{t('receipt.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item, i) => {
                    const applied = item.prixUnitaire ?? item.prixVente;
                    const isNegotiated = !!item.negotiated;
                    return (
                      <tr key={i} className="border-b -gray-100">
                        <td className="py-1.5 pr-2">{item.nom}</td>
                        <td className="py-1.5 text-center">
                          {isNegotiated ? (
                            <>
                              <span className="line-through text-gray-400 mr-1">
                                {item.prixVente.toLocaleString('fr-FR')}
                              </span>
                              {item.quantity} × {applied.toLocaleString('fr-FR')}
                            </>
                          ) : (
                            <>{item.quantity} × {applied.toLocaleString('fr-FR')}</>
                          )}
                        </td>
                        <td className="py-1.5 text-right font-medium">
                          {(item.quantity * applied).toLocaleString('fr-FR')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 border-t border-dashed -gray-300 space-y-1">
              <div className="flex justify-between text-xs">
                <span>{t('receipt.subtotal')}</span>
                <span className="tabular-nums">{formatPrice(sale.subtotal)}</span>
              </div>
              {sale.discount > 0 && (
                <div className="flex justify-between text-xs text-red-500">
                  <span>{t('receipt.discount').replace('{pct}', String(sale.discount))}</span>
                  <span>-{formatFCFA(Math.round(sale.subtotal * sale.discount / 100))}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm pt-1 border-t -gray-200">
                <span>{t('receipt.grandTotal')}</span>
                <span className="tabular-nums">{formatPrice(sale.total)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 pt-1">
                <span>{t('receipt.payment')}</span>
                <span className={sale.paymentMode === 'credit' ? 'font-bold text-red-600' : ''}>
                  {paymentLabel}
                </span>
              </div>
              {sale.amountReceived && (
                <>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{t('receipt.received')}</span>
                    <span className="tabular-nums">{formatPrice(sale.amountReceived)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{t('receipt.change')}</span>
                    <span className="tabular-nums">{formatPrice(sale.changeGiven || 0)}</span>
                  </div>
                </>
              )}
              {sale.paymentMode === 'credit' && (
                <div className="mt-2 pt-2 border-t -gray-200 space-y-1">
                  <div className="text-center">
                    <span className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 rounded">
                      {t('receipt.creditLabel')}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-red-700 font-medium pt-1">
                    <span>{t('receipt.balance')}</span>
                    <span className="tabular-nums">{formatPrice(sale.total - (sale.amountPaid ?? 0))}</span>
                  </div>
                  {sale.dueDate && (
                    <div className="flex justify-between text-[11px] text-gray-600">
                      <span>{t('receipt.dueDate')}</span>
                      <span>{new Date(sale.dueDate).toLocaleDateString('fr-FR')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {sale.paymentMode === 'credit' && (
              <div className="px-6 py-3 border-t border-dashed -gray-300">
                <p className="text-[10px] text-gray-500 text-center mb-1">{t('receipt.signature')}</p>
                <div className="h-10 border-b border-gray-400"></div>
              </div>
            )}

            <div className="px-6 py-4 text-center border-t border-dashed -gray-300">
              <p className="text-xs text-gray-500 italic">{shop.piedPageRecu}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-grid mt-4 justify-center">
            <button onClick={handlePrint} className="nova-btn-primary flex items-center gap-2 px-6 py-3">
              <Printer className="w-4 h-4" /> {t('receipt.print')}
            </button>
            <button onClick={onClose} className="px-6 py-3 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors flex items-center gap-2">
              <X className="w-4 h-4" /> {t('receipt.close')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
