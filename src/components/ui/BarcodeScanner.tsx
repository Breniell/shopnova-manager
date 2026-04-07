import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Camera } from 'lucide-react';

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ open, onClose, onScan }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<any>(null);
  const [manualCode, setManualCode] = useState('');
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDetectedCode(null);
      setManualCode('');
      setError(null);
      return;
    }

    let cancelled = false;

    const startScanner = async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        readerRef.current = reader;

        if (videoRef.current && !cancelled) {
          await reader.decodeFromVideoDevice(
            undefined,
            videoRef.current,
            (result) => {
              if (result && !cancelled) {
                const code = result.getText();
                setDetectedCode(code);
                setTimeout(() => {
                  if (!cancelled) {
                    onScan(code);
                    onClose();
                  }
                }, 800);
              }
            }
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError("Impossible d'accéder à la caméra. Utilisez la saisie manuelle.");
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      if (videoRef.current) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream?.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [open]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScan(manualCode.trim());
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Camera className="w-5 h-5 text-primary" />
            Scanner un code-barres
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Camera view */}
          <div className="relative w-full aspect-[4/3] bg-background rounded-lg overflow-hidden">
            {error ? (
              <div className="absolute inset-0 flex items-center justify-center text-center p-4">
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            ) : (
              <>
                <video ref={videoRef} className="w-full h-full object-cover" />
                {/* Scan frame corners */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative w-3/4 h-1/2">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 -primary" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 -primary" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 -primary" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 -primary" />
                    {/* Scan line */}
                    <div className="absolute left-0 right-0 h-0.5 bg-primary/80 scan-line" />
                  </div>
                </div>
              </>
            )}

            {/* Detected overlay */}
            {detectedCode && (
              <div className="absolute inset-0 bg-secondary/20 flex items-center justify-center animate-fade-in">
                <div className="bg-card border -secondary rounded-lg px-4 py-2">
                  <p className="text-sm text-secondary font-medium">Code détecté: {detectedCode}</p>
                </div>
              </div>
            )}
          </div>

          {/* Manual entry */}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              className="nova-input flex-1"
              placeholder="Saisir le code-barres manuellement..."
            />
            <button type="submit" className="nova-btn-primary px-4" disabled={!manualCode.trim()}>
              Valider
            </button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
