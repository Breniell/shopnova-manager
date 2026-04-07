import React from 'react';
import { cn } from '@/lib/utils';
import { formatFCFA, formatTime, formatDateShort } from '@/lib/utils';
import { Sale } from '@/stores/useSaleStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { X, Printer } from 'lucide-react';

interface ReceiptModalProps {
  sale: Sale | null;
  open: boolean;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ sale, open, onClose }) => {
  const { shop } = useSettingsStore();

  if (!open || !sale) return null;

  const handlePrint = () => window.print();

  const paymentLabel = sale.paymentMode === 'especes' ? 'Espèces' : sale.paymentMode === 'mobile_money' ? 'Mobile Money' : 'Crédit';

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
        <div className="animate-scale-in" onClick={e => e.stopPropagation()}>
          {/* Receipt */}
          <div className="receipt-print bg-white text-gray-900 w-[320px] rounded-xl overflow-hidden shadow-2xl">
            <div className="p-6 text-center border-b border-dashed border-gray-300">
              <h2 className="font-bold text-lg">{shop.nom}</h2>
              <p className="text-xs text-gray-500 mt-1">{shop.adresse}</p>
              <p className="text-xs text-gray-500">{shop.telephone}</p>
              {shop.enteteRecu && <p className="text-xs text-gray-600 mt-2 italic">{shop.enteteRecu}</p>}
            </div>

            <div className="px-6 py-3 border-b border-dashed border-gray-300">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Reçu: {sale.saleNumber}</span>
                <span>{formatDateShort(new Date(sale.date))}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Caissier: {sale.userName}</span>
                <span>{formatTime(new Date(sale.date))}</span>
              </div>
            </div>

            <div className="px-6 py-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-1 font-medium">Article</th>
                    <th className="text-center py-1 font-medium">Qté</th>
                    <th className="text-right py-1 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1.5 pr-2">{item.nom}</td>
                      <td className="py-1.5 text-center">{item.quantity} × {item.prixVente.toLocaleString('fr-FR')}</td>
                      <td className="py-1.5 text-right font-medium">{(item.quantity * item.prixVente).toLocaleString('fr-FR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 border-t border-dashed border-gray-300 space-y-1">
              <div className="flex justify-between text-xs">
                <span>Sous-total</span>
                <span>{formatFCFA(sale.subtotal)}</span>
              </div>
              {sale.discount > 0 && (
                <div className="flex justify-between text-xs text-red-500">
                  <span>Remise ({sale.discount}%)</span>
                  <span>-{formatFCFA(Math.round(sale.subtotal * sale.discount / 100))}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm pt-1 border-t border-gray-200">
                <span>TOTAL</span>
                <span>{formatFCFA(sale.total)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 pt-1">
                <span>Paiement</span>
                <span>{paymentLabel}</span>
              </div>
              {sale.amountReceived && (
                <>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Reçu</span>
                    <span>{formatFCFA(sale.amountReceived)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Monnaie</span>
                    <span>{formatFCFA(sale.changeGiven || 0)}</span>
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 text-center border-t border-dashed border-gray-300">
              <p className="text-xs text-gray-500 italic">{shop.piedPageRecu}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 mt-4 justify-center">
            <button onClick={handlePrint} className="nova-btn-primary flex items-center gap-2 px-6 py-3">
              <Printer className="w-4 h-4" /> Imprimer
            </button>
            <button onClick={onClose} className="px-6 py-3 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors flex items-center gap-2">
              <X className="w-4 h-4" /> Fermer
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
