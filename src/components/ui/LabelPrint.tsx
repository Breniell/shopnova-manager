import React, { useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Printer, Tag } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { formatFCFA } from '@/utils/formatters';
import { useTranslation } from '@/i18n';
import type { Product } from '@/stores/useProductStore';

interface LabelPrintProps {
  product: Product | null;
  onClose: () => void;
}

export const LabelPrint: React.FC<LabelPrintProps> = ({ product, onClose }) => {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!product || !svgRef.current) return;
    try {
      JsBarcode(svgRef.current, product.codeBarre, {
        format: 'EAN13',
        displayValue: true,
        fontSize: 12,
        height: 55,
        margin: 6,
        background: '#ffffff',
        lineColor: '#000000',
      });
    } catch { /* barcode value not renderable */ }
  }, [product]);

  const handlePrint = () => {
    if (!product || !svgRef.current) return;
    const svgHtml = svgRef.current.outerHTML;
    // XSS-safe: escape user-provided strings before inserting into HTML
    const safeName = product.nom
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const safePrice = formatFCFA(product.prixVente)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const win = window.open('', '_blank', 'width=340,height=280');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html><head><title>Étiquette — ${safeName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; padding: 12px; text-align: center; }
  .name { font-size: 13px; font-weight: bold; margin-bottom: 4px; max-width: 200px; margin-inline: auto; }
  .price { font-size: 18px; font-weight: bold; color: #a93200; margin-bottom: 6px; }
  svg { width: 200px; }
  @media print { @page { margin: 0; } body { padding: 4px; } }
</style></head>
<body>
  <p class="name">${safeName}</p>
  <p class="price">${safePrice}</p>
  ${svgHtml}
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  return (
    <Dialog open={!!product} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[320px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Tag className="w-4 h-4 text-primary" />
            {t('produits.labelPrintBtn')}
          </DialogTitle>
        </DialogHeader>

        {product && (
          <div className="space-y-4">
            {/* Label preview */}
            <div className="border border-border rounded-lg p-4 bg-white text-center space-y-1">
              <p className="text-sm font-semibold text-black line-clamp-2">{product.nom}</p>
              <p className="text-lg font-bold" style={{ color: '#a93200' }}>{formatFCFA(product.prixVente)}</p>
              <svg ref={svgRef} className="w-full max-w-[200px] mx-auto block" />
            </div>

            <p className="text-[11px] text-muted-foreground">
              {t('produits.labelPrintHint')}
            </p>

            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground text-sm hover:bg-muted/80 transition-colors">
                {t('produits.cancel')}
              </button>
              <button onClick={handlePrint} className="flex-1 nova-btn-primary py-2.5 flex items-center justify-center gap-1.5 text-sm">
                <Printer className="w-4 h-4" />
                {t('produits.labelPrint')}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
