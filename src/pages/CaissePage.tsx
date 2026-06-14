import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useProductStore, Product } from '@/stores/useProductStore';
import { useSaleStore, PaymentMode, MobileOperator } from '@/stores/useSaleStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCashSessionStore } from '@/stores/useCashSessionStore';
import { usePaymentStore } from '@/stores/usePaymentStore';
import type { Customer } from '@/stores/useCustomerStore';
import { checkCreditLimit, getCustomerOutstanding } from '@/lib/credit';
import { useTranslation } from '@/i18n';
import { formatPrice, formatFCFA } from '@/utils/formatters';

import { StatusBadge } from '@/components/ui/StatusBadge';
import { ReceiptModal } from '@/components/ui/ReceiptModal';
import { BarcodeScanner } from '@/components/ui/BarcodeScanner';
import { CustomerPicker } from '@/components/ui/CustomerPicker';
import { PriceEditor } from '@/components/ui/PriceEditor';
import { ManagerOverrideModal } from '@/components/ui/ManagerOverrideModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { OneTimeHint } from '@/components/ui/OneTimeHint';
import { isNegociable, getEffectiveFloor, getAppliedPrice } from '@/lib/pricing';
import { canValidateMomo, isValidMomoRef } from '@/lib/momoValidation';
import { isThermalAvailable, buildReceiptHtml } from '@/lib/thermalPrint';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { getStockStatus, cn } from '@/lib/utils';
import { productImages } from '@/assets/productImages';
import { Search, ScanBarcode, Minus, Plus, Trash2, ShoppingCart, Check, Package, X, Pencil, Handshake, Banknote, Smartphone, NotebookPen, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { Sale } from '@/stores/useSaleStore';

const CaissePage: React.FC = () => {
  const { products } = useProductStore();
  const { cart, discount, addToCart, removeFromCart, updateCartQuantity, clearCart, setDiscount, getCartSubtotal, getCartTotal, completeSale, applyPriceOverride } = useSaleStore();
  const { currentUser } = useAuthStore();
  const { getCurrentSession } = useCashSessionStore();
  const currentSession = getCurrentSession();
  const { shop } = useSettingsStore();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('especes');
  const [amountReceived, setAmountReceived] = useState('');
  const [mobileOperator, setMobileOperator] = useState<MobileOperator>('mtn');
  const [mobileRef, setMobileRef] = useState('');
  const [confirmationReceived, setConfirmationReceived] = useState(false);
  const [mobileRefError, setMobileRefError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [addedProductId, setAddedProductId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [dueDate, setDueDate] = useState<string>('');
  const [priceEditorTarget, setPriceEditorTarget] = useState<{ productId: string; currentPrice: number } | null>(null);
  const [overrideContext, setOverrideContext] = useState<{
    productId: string; productName: string; requestedPrice: number; floor: number;
  } | null>(null);
  const [mobileView, setMobileView] = useState<'products' | 'cart'>('products');
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Physical barcode scanner (USB HID / Bluetooth pistol-type) ─────────────
  const SCAN_SPEED_MS = 50;
  const barcodeBuffer = useRef('');
  const barcodeTimeout = useRef<ReturnType<typeof setTimeout>>();
  const lastKeyTime = useRef(0);
  const isScanningRef = useRef(false);

  const handleBarcodeScanned = useCallback((barcode: string) => {
    const product = products.find(p => p.codeBarre === barcode);
    if (product) {
      const inCart = cart.find(c => c.productId === product.id);
      const qtyInCart = inCart ? inCart.quantity : 0;
      if (product.stock <= 0) {
        toast.error(t('caisse.outOfStockName').replace('{name}', product.nom));
        return;
      }
      if (qtyInCart >= product.stock) {
        toast.error(
          t('caisse.insufficientStockScan')
            .replace('{available}', String(product.stock))
            .replace('{qty}', String(qtyInCart))
        );
        return;
      }
      addToCart({ productId: product.id, nom: product.nom, prixVente: product.prixVente });
      setAddedProductId(product.id);
      setTimeout(() => setAddedProductId(null), 500);
      toast.success(t('caisse.addedToCartName').replace('{name}', product.nom));
    } else {
      toast.error(t('caisse.productNotFound').replace('{barcode}', barcode));
    }
  }, [products, addToCart, cart, t]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      const timeSinceLast = now - lastKeyTime.current;

      if (timeSinceLast < SCAN_SPEED_MS && e.key.length === 1) {
        isScanningRef.current = true;
      }

      if (e.key === 'Enter') {
        if (isScanningRef.current && barcodeBuffer.current.length > 3) {
          e.preventDefault();
          const barcode = barcodeBuffer.current;
          barcodeBuffer.current = '';
          isScanningRef.current = false;
          lastKeyTime.current = 0;
          handleBarcodeScanned(barcode);
        } else {
          barcodeBuffer.current = '';
          isScanningRef.current = false;
        }
        return;
      }

      if (e.key.length === 1) {
        if (isScanningRef.current) {
          e.preventDefault();
        }
        barcodeBuffer.current += e.key;
        clearTimeout(barcodeTimeout.current);
        barcodeTimeout.current = setTimeout(() => {
          barcodeBuffer.current = '';
          isScanningRef.current = false;
        }, 200);
      }

      lastKeyTime.current = now;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(barcodeTimeout.current);
    };
  }, [handleBarcodeScanned]);

  const handleAddProduct = (product: Product) => {
    const inCart = cart.find(c => c.productId === product.id);
    const qtyInCart = inCart ? inCart.quantity : 0;
    if (product.stock <= 0) {
      toast.error(t('caisse.outOfStockClick'));
      return;
    }
    if (qtyInCart >= product.stock) {
      toast.error(
        t('caisse.insufficientStockScan')
          .replace('{available}', String(product.stock))
          .replace('{qty}', String(qtyInCart))
      );
      return;
    }
    addToCart({ productId: product.id, nom: product.nom, prixVente: product.prixVente });
    setAddedProductId(product.id);
    setTimeout(() => setAddedProductId(null), 500);
    toast.success(t('caisse.addedName').replace('{name}', product.nom));
  };

  const subtotal = getCartSubtotal();
  const total = getCartTotal();
  const change = paymentMode === 'especes' && amountReceived ? (parseInt(amountReceived, 10) || 0) - total : 0;
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  // ─── Calculs crédit ──────────────────────────────────────────────────────
  const { sales: allSales } = useSaleStore();
  const { payments: allPayments } = usePaymentStore();

  const customerOutstanding = useMemo(() => {
    if (!selectedCustomer) return 0;
    return getCustomerOutstanding(selectedCustomer.id, allSales, allPayments);
  }, [selectedCustomer, allSales, allPayments]);

  const creditLimitCheck = useMemo(() => {
    if (paymentMode !== 'credit' || !selectedCustomer) return { ok: true as const };
    return checkCreditLimit(
      selectedCustomer.id,
      total,
      selectedCustomer.plafondCredit,
      allSales,
      allPayments,
    );
  }, [paymentMode, selectedCustomer, total, allSales, allPayments]);

  const momoMerchantCode = mobileOperator === 'mtn'
    ? shop.momoMerchantCodeMtn
    : shop.momoMerchantCodeOrange;

  const handleSetPaymentMode = (mode: PaymentMode) => {
    setPaymentMode(mode);
    setConfirmationReceived(false);
    setMobileRefError(null);
  };

  const canValidate = cart.length > 0 && !isProcessing && (
    paymentMode === 'especes' ? (amountReceived && (parseInt(amountReceived, 10) || 0) >= total) :
    paymentMode === 'mobile_money' ? canValidateMomo({ mobileOperator, momoMerchantCode, confirmationReceived, mobileRef }) :
    paymentMode === 'credit' ? (!!selectedCustomer && creditLimitCheck.ok) :
    false
  );

  const handleValidate = async () => {
    if (!canValidate || !currentUser) return;
    setIsProcessing(true);

    await new Promise(resolve => setTimeout(resolve, 600));

    const sale = completeSale({
      paymentMode,
      mobileOperator: paymentMode === 'mobile_money' ? mobileOperator : undefined,
      mobileReference: paymentMode === 'mobile_money' ? mobileRef.trim() : undefined,
      momoMerchantCode: paymentMode === 'mobile_money' ? momoMerchantCode : undefined,
      confirmationAcknowledged: paymentMode === 'mobile_money' ? true : undefined,
      amountReceived: paymentMode === 'especes' ? (parseInt(amountReceived, 10) || 0) : undefined,
      changeGiven: paymentMode === 'especes' ? Math.max(0, change) : undefined,
      userId: currentUser.id,
      userName: `${currentUser.prenom} ${currentUser.nom}`,
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer ? `${selectedCustomer.prenom} ${selectedCustomer.nom}` : undefined,
      dueDate: paymentMode === 'credit' && dueDate ? dueDate : undefined,
    });

    setIsProcessing(false);
    setIsDone(true);
    setReceiptSale(sale);
    toast.success(t('caisse.saleSuccess'));

    // Auto-print on sale (never blocks or loses the sale on failure)
    let autoPrinted = false;
    if (shop.autoPrintOnSale && isThermalAvailable() && shop.printerName) {
      try {
        const payLabel = paymentMode === 'especes' ? t('receipt.payEspeces') : paymentMode === 'mobile_money' ? t('receipt.payMobile') : t('receipt.payCredit');
        const html = buildReceiptHtml(sale, shop, payLabel);
        const result = await window.legwan!.printer!.printReceipt({ html, printerName: shop.printerName, paperWidth: shop.paperWidth });
        if (result.ok) {
          autoPrinted = true;
          if (shop.openDrawerOnSale) {
            window.legwan!.printer!.openDrawer().catch(() => {});
          }
        } else {
          toast.error(t('caisse.printError'));
        }
      } catch {
        toast.error(t('caisse.printError'));
      }
    }

    await new Promise(resolve => setTimeout(resolve, 600));

    setIsDone(false);
    if (!autoPrinted) setShowReceipt(true);
    setAmountReceived('');
    setMobileRef('');
    setConfirmationReceived(false);
    setMobileRefError(null);
    setSelectedCustomer(null);
    setDueDate('');
    setMobileView('products');
  };

  const filteredProducts = products.filter(p =>
    p.nom.toLowerCase().includes(search.toLowerCase()) ||
    p.codeBarre.includes(search)
  );

  const getProductImage = (product: Product) => productImages[product.id] || null;

  const firstNegotiableProductId = cart.find(item => {
    const p = products.find(pp => pp.id === item.productId);
    return p ? isNegociable(p) : false;
  })?.productId;

  // ── Shared cart panel content ──────────────────────────────────────────────
  const CartPanel = (
    <div className="flex flex-col h-full bg-card">
      <div className="p-4 lg:p-5 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-5 h-5 text-primary" aria-hidden="true" />
          <h2 className="nova-heading text-foreground">{t('caisse.cartTitle')}</h2>
        </div>
        {cart.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="bg-primary/20 text-primary text-xs font-medium px-2.5 py-1 rounded-full">
              {cartCount > 1
                ? t('caisse.cartArticlePlural').replace('{n}', String(cartCount))
                : t('caisse.cartArticle').replace('{n}', String(cartCount))}
            </span>
            <button
              onClick={clearCart}
              className="p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
              aria-label={t('caisse.clearCartAriaLabel')}
              title={t('caisse.clearCartAriaLabel')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Customer picker */}
      <div className="px-4 lg:px-5 pt-3 pb-2 border-b border-border shrink-0">
        <CustomerPicker
          selectedCustomer={selectedCustomer}
          onSelect={setSelectedCustomer}
        />
      </div>

      {cart.length === 0 ? (
        <EmptyState
          icon={<Package className="w-12 h-12" />}
          title={t('caisse.cartEmptyTitle')}
          description={t('caisse.cartEmptyDesc')}
          className="flex-1"
        />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-3 lg:p-4 space-y-2">
            {cart.map((item, index) => {
              const cartProduct = products.find(p => p.id === item.productId);
              const isFirstNegotiable = cartProduct && isNegociable(cartProduct) && item.productId === firstNegotiableProductId;
              return (
              <React.Fragment key={item.productId}>
                {isFirstNegotiable && (
                  <OneTimeHint id="caisse-negotiate">{t('caisse.negotiableHint')}</OneTimeHint>
                )}
              <div
                className="flex items-center gap-2 lg:gap-3 p-2 lg:p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors animate-slide-in-right"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {productImages[item.productId] ? (
                  <img src={productImages[item.productId]} alt={item.nom} className="w-9 h-9 lg:w-10 lg:h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs lg:text-sm font-medium text-foreground truncate">{item.nom}</p>
                  {(() => {
                    const product = products.find(p => p.id === item.productId);
                    const applied = getAppliedPrice(item);
                    const negotiable = product ? isNegociable(product) : false;
                    const isNegotiated = !!item.negotiated;
                    const belowFloor = item.negotiated?.belowFloor;
                    if (!negotiable) {
                      return (
                        <span className="text-[11px] mt-0.5 px-1 py-0.5 text-muted-foreground inline-block">
                          <span className="tabular-nums">{formatFCFA(applied)}</span> / u.
                        </span>
                      );
                    }
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (!product) return;
                          setPriceEditorTarget({ productId: item.productId, currentPrice: applied });
                        }}
                        className={cn(
                          'text-[11px] transition-colors mt-0.5 -ml-0.5 px-1 py-0.5 rounded cursor-pointer hover:bg-muted inline-flex items-center gap-1',
                          isNegotiated && belowFloor ? 'text-destructive font-semibold'
                            : isNegotiated ? 'text-amber-400 font-medium'
                            : 'text-muted-foreground'
                        )}
                        title={t('caisse.clickToNegotiate')}
                      >
                        {isNegotiated && (
                          <span className="line-through text-muted-foreground/60 mr-1 tabular-nums">
                            {formatFCFA(item.prixVente)}
                          </span>
                        )}
                        <span className="tabular-nums">{formatFCFA(applied)}</span> / u.
                        {isNegotiated && (belowFloor ? ' ⚡' : ' •')}
                        <Pencil className="w-2.5 h-2.5 ml-0.5 shrink-0" />
                      </button>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-1 lg:gap-2">
                  <button
                    onClick={() => updateCartQuantity(item.productId, item.quantity - 1)}
                    className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center hover:bg-muted/80 transition-all active:scale-90"
                    aria-label={t('caisse.decreaseQty').replace('{name}', item.nom)}
                  >
                    <Minus className="w-4 h-4 text-foreground" aria-hidden="true" />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold text-foreground tabular-nums" aria-label={t('caisse.quantityLabel').replace('{n}', String(item.quantity))}>{item.quantity}</span>
                  <button onClick={() => {
                    const product = products.find(p => p.id === item.productId);
                    if (product && item.quantity >= product.stock) {
                      toast.error(t('caisse.stockMaxReached').replace('{n}', String(product.stock)));
                      return;
                    }
                    updateCartQuantity(item.productId, item.quantity + 1);
                  }}
                    className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center hover:bg-muted/80 transition-all active:scale-90"
                    aria-label={t('caisse.increaseQty').replace('{name}', item.nom)}
                  >
                    <Plus className="w-4 h-4 text-foreground" aria-hidden="true" />
                  </button>
                </div>
                <span className="text-xs lg:text-sm font-semibold text-foreground tabular-nums w-20 lg:w-24 text-right">{formatPrice(item.quantity * getAppliedPrice(item))}</span>
                <button
                  onClick={() => removeFromCart(item.productId)}
                  className="p-1.5 rounded-lg hover:bg-destructive/20 transition-all active:scale-90 text-muted-foreground hover:text-destructive"
                  aria-label={t('caisse.removeFromCart').replace('{name}', item.nom)}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              </React.Fragment>
            );
            })}
          </div>

          {/* Totals & Payment */}
          <div className="border-t border-border p-4 lg:p-5 space-y-3 lg:space-y-4 shrink-0">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('caisse.subtotal')}</span>
                <span className="text-foreground tabular-nums">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('caisse.discount')}</span>
                <input
                  type="number" min="0" max="100"
                  value={discount || ''}
                  onChange={e => setDiscount(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  className="nova-input w-20 text-right py-1 px-2 text-sm"
                  placeholder="0"
                />
              </div>
              <div className="pt-2 border-t border-border">
                <p className="text-[13px] text-muted-foreground font-medium mb-0.5">{t('caisse.total')}</p>
                <p className="money text-3xl lg:text-4xl text-primary text-right">{formatPrice(total)}</p>
              </div>
            </div>

            {/* Payment mode tabs */}
            <div className="flex gap-2">
              {([
                { mode: 'especes' as PaymentMode, Icon: Banknote, label: t('caisse.payEspeces') },
                { mode: 'mobile_money' as PaymentMode, Icon: Smartphone, label: t('caisse.payMobile') },
                { mode: 'credit' as PaymentMode, Icon: NotebookPen, label: t('caisse.payCredit') },
              ]).map(({ mode, Icon, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleSetPaymentMode(mode)}
                  className={cn(
                    'flex-1 flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 transition-all duration-150 min-h-[60px] px-1',
                    paymentMode === mode
                      ? mode === 'credit'
                        ? 'bg-red-500/10 border-red-500 text-red-500'
                        : 'bg-primary/10 border-primary text-primary'
                      : 'bg-muted border-border text-muted-foreground hover:text-foreground hover:border-border'
                  )}
                >
                  <Icon className="w-6 h-6" />
                  <span className="text-[11px] font-semibold leading-tight text-center">{label}</span>
                </button>
              ))}
            </div>

            {paymentMode === 'especes' && (
              <div className="space-y-2">
                <input
                  type="number" value={amountReceived}
                  onChange={e => setAmountReceived(e.target.value)}
                  className="nova-input w-full py-2"
                  placeholder={t('caisse.amountReceivedPlaceholder')}
                />
                {amountReceived && (parseInt(amountReceived, 10) || 0) >= total && (
                  <div className="rounded-xl bg-secondary/10 border border-secondary/30 p-3 text-center">
                    <p className="text-[11px] text-secondary/70 font-semibold uppercase tracking-wide mb-0.5">{t('caisse.changeLabel')}</p>
                    <p className="money text-2xl text-secondary">{formatFCFA((parseInt(amountReceived, 10) || 0) - total)}</p>
                  </div>
                )}
              </div>
            )}
            {paymentMode === 'mobile_money' && (
              <div className="space-y-3">
                {/* Step 1 — operator */}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setMobileOperator('mtn'); setConfirmationReceived(false); }}
                    className={cn('flex-1 flex items-center justify-center gap-2 rounded-xl border-2 transition-all min-h-[48px] text-sm font-semibold',
                      mobileOperator === 'mtn' ? 'bg-amber-500/15 border-amber-500 text-amber-500' : 'bg-muted border-border text-muted-foreground')}
                  >
                    <Smartphone className="w-4 h-4" /> MTN MoMo
                  </button>
                  <button
                    onClick={() => { setMobileOperator('orange'); setConfirmationReceived(false); }}
                    className={cn('flex-1 flex items-center justify-center gap-2 rounded-xl border-2 transition-all min-h-[48px] text-sm font-semibold',
                      mobileOperator === 'orange' ? 'bg-orange-500/15 border-orange-500 text-orange-500' : 'bg-muted border-border text-muted-foreground')}
                  >
                    <Smartphone className="w-4 h-4" /> Orange Money
                  </button>
                </div>

                {/* Step 2 — instructions or warning */}
                {momoMerchantCode ? (
                  <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-1.5">
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                      {mobileOperator === 'mtn' ? 'MTN MoMo' : 'Orange Money'}
                    </p>
                    <p className="text-xs text-foreground leading-snug">
                      {(mobileOperator === 'mtn'
                        ? t('caisse.momoInstructionsMtn')
                        : t('caisse.momoInstructionsOrange'))
                        .replace('{code}', momoMerchantCode)
                        .replace('{amount}', String(total))}
                    </p>
                    <p className="money text-lg text-primary text-right pt-1">{formatFCFA(total)}</p>
                  </div>
                ) : (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-amber-500">{t('caisse.momoNoCodeWarning')}</p>
                      <a href="#/parametres" className="text-[11px] text-primary underline">{t('caisse.momoGoToSettings')}</a>
                    </div>
                  </div>
                )}

                {/* Step 3 — SMS confirmation checkbox */}
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmationReceived}
                    onChange={e => setConfirmationReceived(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded"
                  />
                  <span className="text-xs font-medium text-foreground">{t('caisse.momoSmsConfirm')}</span>
                </label>

                {/* Step 4 — reference input */}
                <div>
                  <label className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide block mb-1">
                    {t('caisse.momoRefLabel')}
                  </label>
                  <input
                    type="text"
                    value={mobileRef}
                    onChange={e => {
                      setMobileRef(e.target.value);
                      setMobileRefError(null);
                    }}
                    onBlur={() => {
                      if (mobileRef && !isValidMomoRef(mobileRef)) {
                        setMobileRefError(t('caisse.momoRefError'));
                      }
                    }}
                    className={cn('nova-input w-full', mobileRefError ? 'border-destructive focus:ring-destructive' : '')}
                    placeholder={t('caisse.mobileRefPlaceholder')}
                  />
                  {mobileRefError && (
                    <p className="text-[11px] text-destructive mt-1">{mobileRefError}</p>
                  )}
                </div>
              </div>
            )}
            {paymentMode === 'credit' && (
              <div className="space-y-2">
                {!selectedCustomer ? (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
                    {t('caisse.creditNoCustomer')}
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{t('caisse.creditOutstanding')}</span>
                      <span className="text-foreground tabular-nums">
                        {formatFCFA(customerOutstanding)}
                      </span>
                    </div>
                    {selectedCustomer.plafondCredit !== undefined && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{t('caisse.creditLimit')}</span>
                        <span className="text-foreground tabular-nums">
                          {formatFCFA(selectedCustomer.plafondCredit)}
                        </span>
                      </div>
                    )}
                    {creditLimitCheck.ok === false && (
                      <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs">
                        {t('caisse.creditLimitExceeded').replace('{n}', formatFCFA(creditLimitCheck.afterSale))}
                      </div>
                    )}
                    <input
                      type="date" value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="nova-input w-full py-2 text-xs"
                      placeholder={t('caisse.dueDatePlaceholder')}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {t('caisse.creditReceiptNote')}
                    </p>
                  </>
                )}
              </div>
            )}

            <button
              onClick={handleValidate}
              disabled={!canValidate}
              className={cn(
                'w-full rounded-xl text-base font-bold transition-all duration-150 flex items-center justify-center gap-2',
                isDone ? 'bg-secondary text-secondary-foreground' : 'nova-btn-primary'
              )}
              style={{ minHeight: '56px' }}
            >
              {isProcessing ? (
                <><LoadingSpinner size={18} className="text-white" />{t('caisse.validate')}</>
              ) : isDone ? (
                <><Check className="w-5 h-5" /> {t('caisse.validating')}</>
              ) : (
                t('caisse.validate')
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );

  // ── Guard : un caissier doit avoir une session ouverte pour vendre ────────
  if (currentUser?.role === 'caissier' && !currentSession) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="nova-card-accent p-8 max-w-md text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="nova-heading text-lg text-foreground mb-2">
            {t('caisse.noSessionTitle')}
          </h2>
          <p className="text-sm text-muted-foreground mb-5">
            {t('caisse.noSessionDesc')}
          </p>
          <button
            onClick={() => window.location.href = '/ouverture-session'}
            className="nova-btn-primary px-5 py-2.5 inline-flex items-center gap-2"
          >
            {t('caisse.openSession')}
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex flex-col lg:flex-row" style={{ height: 'calc(100vh - 0px)' }}>

      {/* Products panel */}
      <div className={cn(
        'flex flex-col border-r border-border',
        'lg:flex-[58]',
        mobileView === 'products' ? 'flex flex-col flex-1' : 'hidden lg:flex'
      )}>
        <div className="p-3 lg:p-5 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-3 lg:left-4 top-1/2 -translate-y-1/2 w-4 lg:w-5 h-4 lg:h-5 text-muted-foreground" />
            <input
              id="pos-search"
              ref={searchRef}
              type="text"
              placeholder={t('caisse.searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="nova-input w-full pl-10 lg:pl-12 pr-10 lg:pr-12 py-2 lg:py-3 text-sm"
              aria-label={t('caisse.searchAriaLabel')}
            />
            <button
              onClick={() => setShowScanner(true)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 lg:p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label={t('caisse.scannerAriaLabel')}
            >
              <ScanBarcode className="w-4 lg:w-5 h-4 lg:h-5 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 lg:p-5">
          {filteredProducts.length === 0 ? (
            <EmptyState icon={<Package className="w-10 h-10" />} title={t('caisse.noProduct')} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-3">
              {filteredProducts.map(product => {
                const status = getStockStatus(product.stock, product.seuilAlerte);
                const isOut = status === 'stockout';
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
                    <div className="w-full h-20 lg:h-24 bg-muted/30 flex items-center justify-center overflow-hidden relative">
                      {image ? (
                        <img src={image} alt={product.nom} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                      ) : (
                        <Package className="w-7 lg:w-8 h-7 lg:h-8 text-muted-foreground/40" />
                      )}
                      {isOut && (
                        <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">{t('caisse.outOfStock')}</span>
                        </div>
                      )}
                      <div className="absolute top-1.5 right-1.5">
                        <StatusBadge status={status} className="text-[9px] px-1.5 py-0" />
                      </div>
                      {isNegociable(product) && !isOut && (
                        <div className="absolute top-1.5 left-1.5">
                          <span className="inline-flex items-center gap-0.5 bg-amber-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                            <Handshake className="w-2.5 h-2.5" />
                            {t('caisse.negotiableBadge')}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-2 lg:p-3">
                      <p className="text-[13px] font-semibold text-foreground line-clamp-2 leading-tight">{product.nom}</p>
                      <p className="money text-sm text-primary mt-1">{formatFCFA(product.prixVente)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Cart panel */}
      <div className={cn(
        'lg:flex-[42]',
        mobileView === 'cart' ? 'flex flex-col flex-1' : 'hidden lg:flex lg:flex-col'
      )}>
        {CartPanel}
      </div>

      {/* ── Mobile bottom tab bar ── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border flex pb-safe">
        <button
          onClick={() => setMobileView('products')}
          className={cn(
            'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
            mobileView === 'products' ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          <Package className="w-5 h-5" />
          {t('caisse.tabProducts')}
        </button>
        <button
          onClick={() => setMobileView('cart')}
          className={cn(
            'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors relative',
            mobileView === 'cart' ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          <ShoppingCart className="w-5 h-5" />
          {t('caisse.tabCart')}
          {cartCount > 0 && (
            <span className="absolute top-2 right-[calc(50%-18px)] bg-primary text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {cartCount > 9 ? '9+' : cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Spacer for mobile tab bar */}
      <div className="lg:hidden" style={{ height: 'calc(4rem + env(safe-area-inset-bottom))' }} />

      <BarcodeScanner
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleBarcodeScanned}
      />
      <ReceiptModal sale={receiptSale} open={showReceipt} onClose={() => setShowReceipt(false)} />

      {/* Négociation de prix */}
      <PriceEditor
        open={!!priceEditorTarget}
        product={priceEditorTarget ? products.find(p => p.id === priceEditorTarget.productId) ?? null : null}
        currentPrice={priceEditorTarget?.currentPrice ?? 0}
        onClose={() => setPriceEditorTarget(null)}
        onApply={(newPrice, requiresOverride) => {
          if (!priceEditorTarget) return;
          const product = products.find(p => p.id === priceEditorTarget.productId);
          if (!product) return;

          if (requiresOverride) {
            setOverrideContext({
              productId: product.id,
              productName: product.nom,
              requestedPrice: newPrice,
              floor: getEffectiveFloor(product),
            });
            setPriceEditorTarget(null);
          } else {
            applyPriceOverride(product.id, newPrice, false);
            const isBelowTarget = product.prixCible !== undefined && newPrice < product.prixCible;
            if (isBelowTarget) {
              toast.warning(t('caisse.priceNegotiatedReduced'));
            } else if (newPrice < product.prixVente) {
              toast.success(t('caisse.priceNegotiatedApplied'));
            } else {
              toast.success(t('caisse.priceApplied'));
            }
            setPriceEditorTarget(null);
          }
        }}
      />

      {/* Autorisation gérant pour vendre sous le plancher */}
      <ManagerOverrideModal
        open={!!overrideContext}
        context={overrideContext}
        onClose={() => setOverrideContext(null)}
        onAuthorized={(manager) => {
          if (!overrideContext) return;
          applyPriceOverride(
            overrideContext.productId,
            overrideContext.requestedPrice,
            true,
            { userId: manager.userId, userName: manager.userName }
          );
          toast.success(t('caisse.overrideApproved').replace('{name}', manager.userName));
          setOverrideContext(null);
        }}
      />
    </div>
  );
};

export default CaissePage;
