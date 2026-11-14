/**
 * Security audit 2026-11: the shop logo is synchronised from Firestore and is
 * interpolated into an HTML attribute of the receipt sent to the printer.
 */
import { describe, it, expect } from 'vitest';
import { isSafeImageDataUrl } from '@/lib/thermalPrint';

describe('isSafeImageDataUrl', () => {
  it('accepts plain base64 raster data URLs', () => {
    expect(isSafeImageDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isSafeImageDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    expect(isSafeImageDataUrl('data:image/webp;base64,UklGRg==')).toBe(true);
  });

  it('rejects attribute break-out payloads', () => {
    expect(isSafeImageDataUrl('data:image/png;base64,AAA" onerror="alert(1)')).toBe(false);
    expect(isSafeImageDataUrl('x" /><script>alert(1)</script>')).toBe(false);
  });

  it('rejects active or remote image sources', () => {
    expect(isSafeImageDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isSafeImageDataUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageDataUrl('https://evil.example/track.png')).toBe(false);
    expect(isSafeImageDataUrl('file:///C:/Windows/win.ini')).toBe(false);
  });

  it('rejects non-strings and oversized values', () => {
    expect(isSafeImageDataUrl(undefined)).toBe(false);
    expect(isSafeImageDataUrl(42)).toBe(false);
    expect(isSafeImageDataUrl('data:image/png;base64,' + 'A'.repeat(500_000))).toBe(false);
  });
});
