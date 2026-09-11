/**
 * Renders the real thermal receipt HTML at real paper widths and checks that the
 * shop logo actually comes out.
 *
 * Why this is meaningful without a thermal printer on the desk: the app does NOT
 * emit raw ESC/POS. electron/main.mjs builds an HTML document, loads it into a
 * hidden BrowserWindow and calls webContents.print({ deviceName }), so Chromium
 * lays the receipt out and the Windows spooler hands the result to the printer
 * driver. Rendering the same HTML in Chromium here exercises that layout step
 * exactly - same engine, same CSS, same millimetre page box.
 *
 * What it still cannot tell you: how one particular thermal driver dithers the
 * image down to one-bit black and white. That is the only part left for real
 * hardware, and it is a property of the driver, not of Legwan.
 */
import { test, expect, type Page } from '@playwright/test';

/** A tiny real PNG - small enough to inline, real enough to have to decode. */
const LOGO_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAFUlEQVR4nGP8z4APMOGVHZUeWdIAoEIBATGwQmAAAAAASUVORK5CYII=';

function makeSale() {
  return {
    id: 'sale-1',
    saleNumber: '000123',
    date: new Date('2026-09-11T10:30:00Z'),
    items: [
      { id: 'i1', productId: 'p1', nom: 'Coca-Cola 50cl', quantity: 2, prixVente: 500, prixAchat: 350 },
      { id: 'i2', productId: 'p2', nom: 'Savon de Marseille', quantity: 1, prixVente: 1200, prixAchat: 800 },
    ],
    subtotal: 2200,
    discount: 0,
    total: 2200,
    paymentMode: 'especes',
    amountReceived: 3000,
    changeGiven: 800,
    userId: 'u1',
    userName: 'Amina Fotso',
  };
}

function makeShop(overrides: Record<string, unknown> = {}) {
  return {
    nom: 'Boutique Test',
    adresse: 'Akwa, Douala',
    telephone: '+237 6 99 00 11 22',
    paperWidth: '80',
    devise: 'FCFA',
    langue: 'fr',
    ...overrides,
  };
}

/**
 * buildReceiptHtml cannot be imported into this file: it reaches the settings
 * store and therefore firebase.ts, which reads import.meta.env and throws
 * outside Vite. Asking Vite for the module inside the browser runs the shipped
 * implementation rather than a copy of it.
 */
async function renderReceipt(page: Page, shop: Record<string, unknown>): Promise<string> {
  // Serve a blank document from the Vite origin rather than loading the app.
  // Navigating to '/' boots all of React, Firebase and the licence clock, which
  // is slow, flaky under parallel workers, and completely unnecessary: the only
  // thing needed is an origin from which '/src/...' module URLs resolve.
  await page.route('**/__print_harness', route => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><meta charset="utf-8"><title>print harness</title>',
  }));
  await page.goto('/__print_harness', { waitUntil: 'domcontentloaded' });

  return page.evaluate(async ({ shopSettings, sale, specifier }) => {
    // Held in a variable so TypeScript treats it as a dynamic specifier: this
    // path is a URL on the dev server, not a module resolvable from disk.
    const module = await import(/* @vite-ignore */ specifier);
    const build = (module as {
      buildReceiptHtml: (s: unknown, sh: unknown, p: string) => string;
    }).buildReceiptHtml;
    return build(sale, shopSettings, 'Espèces');
  }, { shopSettings: shop, sale: makeSale(), specifier: '/src/lib/thermalPrint.ts' });
}

for (const paperWidth of ['58', '80'] as const) {
  test(`the logo prints inside the ${paperWidth}mm paper width`, async ({ page }) => {
    const html = await renderReceipt(page, makeShop({ paperWidth, logoDataUrl: LOGO_DATA_URL }));
    await page.setContent(html, { waitUntil: 'load' });

    const logo = page.locator('img.logo');
    await expect(logo, 'no logo element in the receipt').toHaveCount(1);

    // naturalWidth stays 0 when the data URI is malformed, which is exactly how
    // a broken logo would reach a shop: silently, as a blank gap on the roll.
    const decoded = await logo.evaluate(img => (img as HTMLImageElement).naturalWidth > 0);
    expect(decoded, 'the logo element exists but the image never decoded').toBe(true);

    // It must fit the paper; anything wider is cropped by the driver.
    const paperPx = await page.evaluate(() => document.body.getBoundingClientRect().width);
    const logoBox = await logo.boundingBox();
    expect(logoBox, 'the logo has no layout box - it is not being displayed').not.toBeNull();
    expect(logoBox!.width).toBeGreaterThan(0);
    expect(logoBox!.width).toBeLessThanOrEqual(paperPx);

    // The 18mm cap from the stylesheet, with a pixel of rounding tolerance.
    const maxHeightPx = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.height = '18mm';
      document.body.appendChild(probe);
      const height = probe.getBoundingClientRect().height;
      probe.remove();
      return height;
    });
    expect(logoBox!.height).toBeLessThanOrEqual(maxHeightPx + 1);

    // The receipt must still carry its text, not just the picture.
    await expect(page.getByText('Boutique Test')).toBeVisible();
    await expect(page.getByText('Coca-Cola 50cl')).toBeVisible();
  });
}

test('a shop with no logo prints a receipt with no image at all', async ({ page }) => {
  const html = await renderReceipt(page, makeShop());
  await page.setContent(html, { waitUntil: 'load' });

  // An empty <img src=""> would print as a broken-image glyph on the roll.
  await expect(page.locator('img')).toHaveCount(0);
  await expect(page.getByText('Boutique Test')).toBeVisible();
});
