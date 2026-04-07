import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useProductStore, Product } from '@/stores/useProductStore';
import { useSaleStore, PaymentMode, MobileOperator } from '@/stores/useSaleStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useStockStore } from '@/stores/useStockStore';
import { formatPrice, formatFCFA } from '@/utils/formatters';

import { StatusBadge } from '@/components/ui/StatusBadge';
import { ReceiptModal } from '@/components/ui/ReceiptModal';
import { BarcodeScanner } from '@/components/ui/BarcodeScanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { getStockStatus, cn } from '@/lib/utils';
import { productImages } from '@/assets/productImages';
import { Search, ScanBarcode, Minus, Plus, Trash2, ShoppingCart, Check, Package } from 'lucide-react';
import { toast } from 'sonner';
import type { Sale } from '@/stores/useSaleStore';

const CaissePage: React.FC = () => {
  const { products } = useProductStore();
  const { cart, discount, addToCart, removeFromCart, updateCartQuantity, setDiscount, getCartSubtotal, getCartTotal, completeSale } = useSaleStore();
  const { currentUser } = useAuthStore();
  const { addMovement } = useStockStore();
  const { updateStock } = useProductStore();
  const [search, setSearch] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('especes');
  const [amountReceived, setAmountReceived] = useState('');
  const [mobileOperator, setMobileOperator] = useState<MobileOperator>('mtn');
  const [mobileRef, setMobileRef] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [addedProductId, setAddedProductId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Barcode scanner via keyboard (USB scanner)
  const barcodeBuffer = useRef('');
  const barcodeTimeout = useRef<ReturnType<typeof setTimeout>>();

  const handleBarcodeScanned = useCallback((barcode: string) => {
    const product = products.find(p => p.codeBarre === barcode);
    if (product) {
      const inCart = cart.find(c => c.productId === product.id);
      const qtyInCart = inCart ? inCart.quantity : 0;
      if (product.stock <= 0) {
        toast.error(`${product.nom} est en rupture de stock`);
        return;
      }
      if (qtyInCart >= product.stock) {
        toast.error(`Stock insuffisant. Disponible : ${product.stock}, dans le panier : ${qtyInCart}`);
        return;
      }
      addToCart({ productId: product.id, nom: product.nom, prixVente: product.prixVente });
      setAddedProductId(product.id);
      setTimeout(() => setAddedProductId(null), 500);
      toast.success(`${product.nom} ajouté au panier`);
    } else {
      toast.error(`Produit non trouvé: ${barcode}`);
    }
  }, [products, addToCart, cart]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        if (document.activeElement.id !== 'pos-search') return;
      }
      if (e.key === 'Enter' && barcodeBuffer.current.length > 5) {
        const barcode = barcodeBuffer.current;
        barcodeBuffer.current = '';
        handleBarcodeScanned(barcode);
        return;
      }
      if (/^\d$/.test(e.key)) {
        barcodeBuffer.current += e.key;
        clearTimeout(barcodeTimeout.current);
        barcodeTimeout.current = setTimeout(() => { barcodeBuffer.current = ''; }, 100);
      }
    };
    window.addEventListener('keypress', handleKeyPress);
    return () => window.removeEventListener('keypress', handleKeyPress);
  }, [handleBarcodeScanned]);

  const handleAddProduct = (product: Product) => {
    const inCart = cart.find(c => c.productId === product.id);
    const qtyInCart = inCart ? inCart.quantity : 0;
    if (product.stock <= 0) {
      toast.error('Ce produit est en rupture de stock');
      return;
    }
    if (qtyInCart >= product.stock) {
      toast.error(`Stock insuffisant. Disponible : ${product.stock}, dans le panier : ${qtyInCart}`);
      return;
    }
    addToCart({ productId: product.id, nom: product.nom, prixVente: product.prixVente });
    setAddedProductId(product.id);
    setTimeout(() => setAddedProductId(null), 500);
    toast.success(`${product.nom} ajouté`);
  };

  const subtotal = getCartSubtotal();
  const total = getCartTotal();
  const change = paymentMode === 'especes' && amountReceived ? (parseInt(amountReceived, 10) || 0) - total : 0;

  const canValidate = cart.length > 0 && !isProcessing && (
    paymentMode === 'especes' ? (amountReceived && (parseInt(amountReceived, 10) || 0) >= total) :
    paymentMode === 'mobile_money' ? !!mobileRef.trim() :
    false
  );

  const handleValidate = async () => {
    if (!canValidate || !currentUser) return;
    setIsProcessing(true);

    setTimeout(() => {
      const sale = completeSale({
        paymentMode,
        mobileOperator: paymentMode === 'mobile_money' ? mobileOperator : undefined,
        mobileReference: paymentMode === 'mobile_money' ? mobileRef : undefined,
        amountReceived: paymentMode === 'especes' ? (parseInt(amountReceived, 10) || 0) : undefined,
        changeGiven: paymentMode === 'especes' ? Math.max(0, change) : undefined,
        userId: currentUser.id,
        userName: `${currentUser.prenom} ${currentUser.nom}`,
      });

      sale.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          updateStock(item.productId, -item.quantity);
          addMovement({
            date: new Date(),
            productId: item.productId,
            productName: item.nom,
            type: 'vente',
            quantity: -item.quantity,
            stockBefore: product.stock,
            stockAfter: product.stock - item.quantity,
            userId: currentUser.id,
            userName: `${currentUser.prenom} ${currentUser.nom}`,
          });
        }
      });

      setIsProcessing(false);
      setIsDone(true);
      setReceiptSale(sale);

      setTimeout(() => {
        setIsDone(false);
        setShowReceipt(true);
        setAmountReceived('');
        setMobileRef('');
      }, 600);

      toast.success('Vente validée avec succès !');
    }, 600);
  };

  const filteredProducts = products.filter(p =>
    p.nom.toLowerCase().includes(search.toLowerCase()) ||
    p.codeBarre.includes(search)
  );

  const getProductImage = (product: Product) => {
    return productImages[product.id] || null;
  };

  return (
    <div className="h-screen flex animate-fade-in">
      {/* Left: Products */}
      <div className="flex-[58] flex flex-col border-r border-">
        <div className="p-5 border-b border-">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              id="pos-search"
              ref={searchRef}
              type="text"
              placeholder="Rechercher un produit ou scanner un code-barres... (F2)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="nova-input w-full pl-12 pr-12 py-3 text-sm"
            />
            <button
              onClick={() => setShowScanner(true)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <ScanBarcode className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-4 gap-grid">
            {filteredProducts.map(product => {
              const status = getStockStatus(product.stock, product.seuilAlerte);
              const isOut = status === 'out';
              const justAdded = addedProductId === product.id;
              const image = getProductImage(product);
              return (
                <button
                  key={product.id}
                  onClick={() => handleAddProduct(product)}
                  disabled={isOut}
                  className={cn(
                    'nova-card p-0 text-left transition-all duration-200 group relative overflow-hidden',
                    isOut ? 'opacity-40 cursor-not-allowed' : 'hover:scale-[1.03] hover:shadow-xl hover:shadow-primary/15 hover:border-primary/30 active:scale-[0.97]',
                    status === 'low' && 'border-amber-500/30',
                    justAdded && 'ring-2 ring-secondary scale-[0.97]'
                  )}
                >
                  {justAdded && (
                    <div className="absolute inset-0 bg-secondary/20 rounded-xl animate-fade-in pointer-events-none z-10" />
                  )}
                  <div className="w-full h-24 bg-muted/30 flex items-center justify-center overflow-hidden relative">
                    {image ? (
                      <img src={image} alt={product.nom} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                    ) : (
                      <Package className="w-8 h-8 text-muted-foreground/40" />
                    )}
                    {isOut && (
                      <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-destructive bg-destructive/10 px-2 py-1 rounded">Rupture</span>
                      </div>
                    )}
                    <div className="absolute top-1.5 right-1.5">
                      <StatusBadge status={status} className="text-[9px] px-1.5 py-0" />
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-medium text-foreground line-clamp-2 h-8 leading-4">{product.nom}</p>
                    <p className="text-sm font-bold text-primary tabular-nums mt-1">{formatFCFA(product.prixVente)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: Cart */}
      <div className="flex-[42] flex flex-col bg-card">
        <div className="p-5 border-b border- flex items-center justify-between">
          <div className="flex items-center gap-grid">
            <ShoppingCart className="w-5 h-5 text-primary" />
            <h2 className="nova-heading text-foreground">Panier en cours</h2>
          </div>
          {cart.length > 0 && (
            <span className="bg-primary/20 text-primary text-xs font-medium px-2.5 py-1 rounded-full">
              {cart.reduce((sum, c) => sum + c.quantity, 0)} article{cart.reduce((sum, c) => sum + c.quantity, 0) > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {cart.length === 0 ? (
          <EmptyState
            icon={<Package className="w-12 h-12" />}
            title="Panier vide"
            description="Scanner ou rechercher un produit pour commencer"
            className="flex-1"
          />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {cart.map((item, index) => (
                <div
                  key={item.productId}
                  className="flex items-center gap-grid p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors animate-slide-in-right"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {productImages[item.productId] ? (
                    <img src={productImages[item.productId]} alt={item.nom} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.nom}</p>
                    <p className="text-xs text-muted-foreground">{formatFCFA(item.prixVente)} / unité</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateCartQuantity(item.productId, item.quantity - 1)}
                      className="w-8 h-8 rounded-lg bg-muted border border- flex items-center justify-center hover:bg-muted/80 transition-all active:scale-90">
                      <Minus className="w-3 h-3 text-foreground" />
                    </button>
                    <span className="w-8 text-center text-sm font-medium text-foreground tabular-nums">{item.quantity}</span>
                    <button onClick={() => {
                      const product = products.find(p => p.id === item.productId);
                      if (product && item.quantity >= product.stock) {
                        toast.error(`Stock max atteint (${product.stock})`);
                        return;
                      }
                      updateCartQuantity(item.productId, item.quantity + 1);
                    }}
                      className="w-8 h-8 rounded-lg bg-muted border border- flex items-center justify-center hover:bg-muted/80 transition-all active:scale-90">
                      <Plus className="w-3 h-3 text-foreground" />
                    </button>
                  </div>
                  <span className="text-sm font-semibold text-foreground tabular-nums w-24 text-right" className="tabular-nums">{formatPrice($2)}</span>
                  <button onClick={() => removeFromCart(item.productId)}
                    className="p-1.5 rounded-lg hover:bg-destructive/20 transition-all active:scale-90 text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Totals & Payment */}
            <div className="border-t border- p-5 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sous-total</span>
                  <span className="text-foreground tabular-nums" className="tabular-nums">{formatPrice($2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Remise (%)</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={discount || ''}
                    onChange={e => {
                      const val = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                      setDiscount(val);
                    }}
                    className="nova-input w-20 text-right py-1 px-2 text-sm"
                    placeholder="0"
                  />
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-">
                  <span className="text-lg font-semibold text-foreground">TOTAL</span>
                  <span className="text-[32px] font-bold text-primary tabular-nums" className="tabular-nums">{formatPrice($2)}</span>
                </div>
              </div>

              {/* Payment mode tabs */}
              <div className="flex gap-2">
                {(['especes', 'mobile_money'] as PaymentMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setPaymentMode(mode)}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-150 border',
                      paymentMode === mode
                        ? 'bg-primary/15 border-primary text-primary'
                        : 'bg-muted border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {mode === 'especes' ? '💵 Espèces' : '📱 Mobile Money'}
                  </button>
                ))}
              </div>

              {/* Payment details */}
              {paymentMode === 'especes' && (
                <div className="space-y-2">
                  <input
                    type="number"
                    value={amountReceived}
                    onChange={e => setAmountReceived(e.target.value)}
                    className="nova-input w-full py-2"
                    placeholder="Montant reçu (FCFA)"
                  />
                  {amountReceived && (parseInt(amountReceived, 10) || 0) >= total && (
                    <div className="text-sm text-secondary font-medium">
                      Monnaie à rendre: {formatFCFA((parseInt(amountReceived, 10) || 0) - total)}
                    </div>
                  )}
                </div>
              )}
              {paymentMode === 'mobile_money' && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button onClick={() => setMobileOperator('mtn')}
                      className={cn('flex-1 py-2 rounded-lg text-xs font-medium border transition-all', mobileOperator === 'mtn' ? 'bg-amber-500/15 border-amber-500 text-amber-400' : 'bg-muted border-border text-muted-foreground')}>
                      MTN MoMo
                    </button>
                    <button onClick={() => setMobileOperator('orange')}
                      className={cn('flex-1 py-2 rounded-lg text-xs font-medium border transition-all', mobileOperator === 'orange' ? 'bg-orange-500/15 border-orange-500 text-orange-400' : 'bg-muted border-border text-muted-foreground')}>
                      Orange Money
                    </button>
                  </div>
                  <input type="text" value={mobileRef} onChange={e => setMobileRef(e.target.value)} className="nova-input w-full py-2" placeholder="Référence transaction" />
                </div>
              )}

              <button
                onClick={handleValidate}
                disabled={!canValidate}
                className={cn(
                  'w-full py-4 rounded-xl text-base font-semibold transition-all duration-150 flex items-center justify-center gap-2',
                  isDone ? 'bg-secondary text-secondary-foreground' : 'nova-btn-primary'
                )}
              >
                {isProcessing ? (
                  <LoadingSpinner size={20} className="text-white" />
                ) : isDone ? (
                  <><Check className="w-5 h-5" /> Vente validée !</>
                ) : (
                  'Valider la vente'
                )}
              </button>
            </div>
          </>
        )}
      </div>

      <BarcodeScanner
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleBarcodeScanned}
      />
      <ReceiptModal sale={receiptSale} open={showReceipt} onClose={() => setShowReceipt(false)} />
    </div>
  );
};

export default CaissePage;
