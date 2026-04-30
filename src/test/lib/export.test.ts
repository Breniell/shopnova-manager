import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportCSV, exportPDF } from '@/lib/export';

// ─── exportCSV ────────────────────────────────────────────────────────────────
describe('exportCSV', () => {
  let createdUrl: string;
  let clickedAnchor: HTMLAnchorElement | null;

  beforeEach(() => {
    createdUrl = 'blob:http://localhost/fake-url';

    // jsdom does not implement these APIs — define them before spying
    URL.createObjectURL = vi.fn().mockReturnValue(createdUrl);
    URL.revokeObjectURL = vi.fn();

    // Capture the anchor click
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreate(tag);
      if (tag === 'a') {
        clickedAnchor = el as HTMLAnchorElement;
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {});
      }
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clickedAnchor = null;
  });

  it('triggers a download anchor click', () => {
    exportCSV('test-file', ['ID', 'Nom'], [['1', 'Coca-Cola']]);
    expect(clickedAnchor).not.toBeNull();
    expect(clickedAnchor!.download).toBe('test-file.csv');
    expect(clickedAnchor!.href).toBe(createdUrl);
  });

  it('revokes the object URL after click', () => {
    exportCSV('test-file', ['ID', 'Nom'], [['1', 'Coca-Cola']]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(createdUrl);
  });

  it('creates a Blob with the CSV content', () => {
    const RealBlob = globalThis.Blob;
    const blobSpy = vi.fn((...args: ConstructorParameters<typeof Blob>) => new RealBlob(...args));
    vi.stubGlobal('Blob', blobSpy);
    exportCSV('rapport', ['Produit', 'Qté'], [['Bière', '12'], ['Eau', '6']]);
    expect(blobSpy).toHaveBeenCalledOnce();
    const csvContent = blobSpy.mock.calls[0][0][0] as string;
    expect(csvContent).toContain('Produit;Qté');
    expect(csvContent).toContain('Bière;12');
    expect(csvContent).toContain('Eau;6');
    vi.unstubAllGlobals();
  });

  it('includes UTF-8 BOM for Excel compatibility', () => {
    const RealBlob = globalThis.Blob;
    const blobSpy = vi.fn((...args: ConstructorParameters<typeof Blob>) => new RealBlob(...args));
    vi.stubGlobal('Blob', blobSpy);
    exportCSV('test', ['H'], [['v']]);
    const csvContent = blobSpy.mock.calls[0][0][0] as string;
    expect(csvContent.charCodeAt(0)).toBe(0xFEFF);
    vi.unstubAllGlobals();
  });

  it('uses semicolon as separator', () => {
    const RealBlob = globalThis.Blob;
    const blobSpy = vi.fn((...args: ConstructorParameters<typeof Blob>) => new RealBlob(...args));
    vi.stubGlobal('Blob', blobSpy);
    exportCSV('test', ['A', 'B', 'C'], [['x', 'y', 'z']]);
    const csvContent = blobSpy.mock.calls[0][0][0] as string;
    expect(csvContent).toContain('A;B;C');
    expect(csvContent).toContain('x;y;z');
    vi.unstubAllGlobals();
  });
});

// ─── exportPDF ────────────────────────────────────────────────────────────────
describe('exportPDF', () => {
  let mockWin: { document: { write: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }; print: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockWin = {
      document: { write: vi.fn(), close: vi.fn() },
      print: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(mockWin as unknown as Window);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('opens a new window', () => {
    exportPDF('Rapport', ['Col'], [['Val']]);
    expect(window.open).toHaveBeenCalledWith('', '_blank');
  });

  it('writes HTML containing the title', () => {
    exportPDF('Mon Rapport Legwan', ['Col'], [['Val']]);
    const written: string = mockWin.document.write.mock.calls[0][0];
    expect(written).toContain('Mon Rapport Legwan');
  });

  it('writes HTML containing the headers', () => {
    exportPDF('Test', ['Produit', 'Quantité', 'Prix'], [['Bière', '6', '3600']]);
    const written: string = mockWin.document.write.mock.calls[0][0];
    expect(written).toContain('Produit');
    expect(written).toContain('Quantité');
  });

  it('writes HTML containing the data rows', () => {
    exportPDF('Test', ['Col'], [['ligne1'], ['ligne2']]);
    const written: string = mockWin.document.write.mock.calls[0][0];
    expect(written).toContain('ligne1');
    expect(written).toContain('ligne2');
  });

  it('includes summary items when provided', () => {
    exportPDF('Test', ['Col'], [['Val']], ['<strong>42</strong>Ventes']);
    const written: string = mockWin.document.write.mock.calls[0][0];
    expect(written).toContain('42');
    expect(written).toContain('Ventes');
  });

  it('calls print after 400ms', () => {
    exportPDF('Test', ['Col'], [['Val']]);
    expect(mockWin.print).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(mockWin.print).toHaveBeenCalledOnce();
  });

  it('closes the document before printing', () => {
    exportPDF('Test', ['Col'], [['Val']]);
    expect(mockWin.document.close).toHaveBeenCalledOnce();
  });
});
