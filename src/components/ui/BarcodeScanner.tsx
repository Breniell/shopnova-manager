import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Camera } from 'lucide-react';
import { useTranslation } from '@/i18n';

// Native BarcodeDetector (Chrome 83+, Electron 13+) — TypeScript declaration
interface NativeBarcodeDetector {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>>;
}
declare const BarcodeDetector: {
  new(opts?: { formats?: string[] }): NativeBarcodeDetector;
};

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ open, onClose, onScan }) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(tr => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    if (!open) {
      setDetectedCode(null);
      setManualCode('');
      setError(null);
      stopCamera();
      return;
    }

    let cancelled = false;

    const handleResult = (code: string) => {
      if (cancelled) return;
      setDetectedCode(code);
      setTimeout(() => { if (!cancelled) { onScan(code); onClose(); } }, 700);
    };

    // Fast path: native BarcodeDetector API (no lib overhead, lower latency)
    const startNative = (detector: NativeBarcodeDetector) => {
      const loop = async () => {
        if (cancelled) return;
        if (videoRef.current && videoRef.current.readyState >= 2) {
          try {
            const results = await detector.detect(videoRef.current);
            if (results.length > 0) { handleResult(results[0].rawValue); return; }
          } catch { /* frame not ready yet, keep looping */ }
        }
        if (!cancelled) rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    };

    // Fallback: @zxing/browser (wider format/platform support)
    const startZxing = async () => {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      if (videoRef.current && !cancelled) {
        await reader.decodeFromVideoDevice(undefined, videoRef.current, result => {
          if (result && !cancelled) handleResult(result.getText());
        });
      }
    };

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) { stream.getTracks().forEach(tr => tr.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        if (typeof BarcodeDetector !== 'undefined') {
          startNative(new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] }));
        } else {
          await startZxing();
        }
      } catch (err) {
        if (cancelled) return;
        const domErr = err instanceof DOMException ? err.name : '';
        const msg = domErr === 'NotAllowedError'
          ? t('barcode.permissionDenied')
          : domErr === 'NotFoundError'
          ? t('barcode.noCamera')
          : t('barcode.cameraError');
        setError(msg);
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) { onScan(manualCode.trim()); onClose(); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Camera className="w-5 h-5 text-primary" />
            {t('barcode.scanTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative w-full aspect-[4/3] bg-background rounded-lg overflow-hidden">
            {error ? (
              <div className="absolute inset-0 flex items-center justify-center text-center p-4">
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            ) : (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative w-3/4 h-1/2">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary" />
                    <div className="absolute left-0 right-0 h-0.5 bg-primary/80 scan-line" />
                  </div>
                </div>
              </>
            )}

            {detectedCode && (
              <div className="absolute inset-0 bg-secondary/20 flex items-center justify-center animate-fade-in">
                <div className="bg-card border border-secondary rounded-lg px-4 py-2">
                  <p className="text-sm text-secondary font-medium">{t('barcode.detected')}: {detectedCode}</p>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              className="nova-input flex-1"
              placeholder={t('barcode.placeholder')}
            />
            <button type="submit" className="nova-btn-primary px-4" disabled={!manualCode.trim()}>
              {t('common.validate')}
            </button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
