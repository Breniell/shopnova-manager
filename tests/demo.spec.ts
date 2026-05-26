/**
 * demo.spec.ts — Démo complète de Legwan
 * Lancer : npm run demo  (avec npx vite déjà actif dans un autre terminal)
 */
import { test, Page } from "@playwright/test";

const FAST   = 500;
const NORMAL = 1200;
const SLOW   = 2000;
const READ   = 2800;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForReady(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);
}

/** Remplit l'input qui suit immédiatement le label donné */
async function fillByLabel(page: Page, labelText: string, value: string) {
  const input = page.locator(`label:has-text("${labelText}") + input, label:has-text("${labelText}") ~ input, label:has-text("${labelText}") + div input`).first();
  await input.click({ timeout: 8000 });
  await input.fill(value);
  await page.waitForTimeout(300);
}

/** Sélectionne une option du select qui suit le label */
async function selectByLabel(page: Page, labelText: string, value: string) {
  const sel = page.locator(`label:has-text("${labelText}") + select, label:has-text("${labelText}") ~ select`).first();
  await sel.selectOption(value, { timeout: 5000 });
  await page.waitForTimeout(300);
}

async function navSidebar(page: Page, label: string) {
  await page.locator("nav a, aside a").filter({ hasText: label }).first().click({ timeout: 8000 });
  await page.waitForTimeout(NORMAL);
}

async function clickButton(page: Page, text: RegExp | string, timeout = 8000) {
  await page.locator("button").filter({ hasText: text }).first().click({ timeout });
  await page.waitForTimeout(FAST);
}

// ─── DÉMO ────────────────────────────────────────────────────────────────────

test("Démo complète Legwan", async ({ page }) => {

  // ══════════════════════════════════════════════════════
  // 1. Écran de connexion
  // ══════════════════════════════════════════════════════
  await page.goto("/");
  await waitForReady(page);
  await page.waitForTimeout(READ);

  // ══════════════════════════════════════════════════════
  // 2. Sélection du profil gérant
  // ══════════════════════════════════════════════════════
  // Attendre que Firebase charge les utilisateurs
  await page.waitForSelector("text=Sélectionnez votre profil", { timeout: 20000 });
  await page.waitForTimeout(SLOW);

  // Cliquer sur la première carte utilisateur (gérant)
  await page.locator("button.flex.items-center.gap-4").first().click({ timeout: 10000 });
  await page.waitForTimeout(SLOW);

  // ══════════════════════════════════════════════════════
  // 3. Saisie du PIN 1234
  // ══════════════════════════════════════════════════════
  await page.waitForSelector("text=Entrez votre code PIN", { timeout: 8000 });
  await page.waitForTimeout(NORMAL);

  for (const digit of ["1", "2", "3", "4"]) {
    await page.locator(".grid.grid-cols-3 button").filter({ hasText: new RegExp(`^${digit}$`) }).first().click();
    await page.waitForTimeout(450);
  }

  // Attendre navigation après login
  await page.waitForTimeout(SLOW);
  await page.waitForTimeout(READ);

  // ══════════════════════════════════════════════════════
  // 4. Tableau de bord — aperçu des KPIs
  // ══════════════════════════════════════════════════════
  await page.waitForTimeout(READ);

  // ══════════════════════════════════════════════════════
  // 5. Produits — ajouter un nouveau produit
  // ══════════════════════════════════════════════════════
  await navSidebar(page, "Produits");
  await page.waitForTimeout(NORMAL);

  await clickButton(page, "Ajouter un produit");
  await page.waitForTimeout(NORMAL);

  // Nom du produit (premier input dans la modal)
  const modalInputs = page.locator(".nova-card input[type='text'], .nova-card input:not([type='number'])");
  await modalInputs.first().click();
  await page.waitForTimeout(200);
  await page.keyboard.type("Coca-Cola 50cl", { delay: 60 });
  await page.waitForTimeout(FAST);

  // Catégorie
  await page.locator(".nova-card select").first().selectOption("Boissons");
  await page.waitForTimeout(FAST);

  // Prix d'achat (premier input number dans la grille 2 colonnes)
  const numberInputs = page.locator(".nova-card input[type='number']");
  await numberInputs.nth(0).fill("350");
  await page.waitForTimeout(FAST);

  // Prix de vente
  await numberInputs.nth(1).fill("500");
  await page.waitForTimeout(SLOW); // laisser voir la marge calculée

  // Stock initial
  await numberInputs.nth(2).fill("48");
  await page.waitForTimeout(NORMAL);

  // Sauvegarder
  await page.locator(".nova-card button").filter({ hasText: /Ajouter|Enregistrer/ }).last().click();
  await page.waitForTimeout(SLOW);
  await page.waitForTimeout(READ);

  // ══════════════════════════════════════════════════════
  // 6. Point de vente — faire une vente complète
  // ══════════════════════════════════════════════════════
  await navSidebar(page, "Point de vente");
  await page.waitForTimeout(READ);

  // Rechercher un produit
  const searchInput = page.locator("input#pos-search, input[placeholder*='Rechercher'], input[placeholder*='Scanner']").first();
  if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await searchInput.click();
    await page.keyboard.type("Coca", { delay: 80 });
    await page.waitForTimeout(SLOW);
  }

  // Cliquer sur la carte produit pour l'ajouter au panier
  // Les produits sont des div cliquables dans la grille gauche
  const productGrid = page.locator(".overflow-y-auto .rounded-xl, .overflow-y-auto .nova-card, .overflow-y-auto [class*='cursor-pointer']").first();
  if (await productGrid.isVisible({ timeout: 5000 }).catch(() => false)) {
    await productGrid.click();
    await page.waitForTimeout(NORMAL);
    await productGrid.click();
    await page.waitForTimeout(NORMAL);
    await productGrid.click();
    await page.waitForTimeout(SLOW);
  }

  // Vider la recherche pour voir tous les produits
  if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await searchInput.clear();
    await page.waitForTimeout(NORMAL);
  }

  await page.waitForTimeout(READ);

  // Saisir le montant reçu (champ en bas du panneau panier)
  const amountInput = page.locator("input[placeholder='Montant reçu (FCFA)']").first();
  if (await amountInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await amountInput.click();
    await amountInput.fill("2000");
    await page.waitForTimeout(SLOW);
  }

  // Valider la vente
  const validateBtn = page.locator("button").filter({ hasText: "Valider la vente" }).first();
  if (await validateBtn.isEnabled({ timeout: 5000 }).catch(() => false)) {
    await validateBtn.click();
    await page.waitForTimeout(SLOW);
    // Laisser voir le reçu
    await page.waitForTimeout(READ);
    // Fermer le reçu
    const closeBtn = page.locator("button").filter({ hasText: /Fermer|Nouvelle vente|Terminer/i }).first();
    if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(NORMAL);
    }
  }

  await page.waitForTimeout(READ);

  // ══════════════════════════════════════════════════════
  // 7. Historique des ventes
  // ══════════════════════════════════════════════════════
  await navSidebar(page, "Ventes");
  await page.waitForTimeout(READ);

  // ══════════════════════════════════════════════════════
  // 8. Stock — entrée + alertes
  // ══════════════════════════════════════════════════════
  await navSidebar(page, "Stock");
  await page.waitForTimeout(SLOW);

  // Faire une entrée de stock
  await clickButton(page, "Entrée de stock");
  await page.waitForTimeout(NORMAL);

  // Sélectionner le premier produit de la liste
  const stockSelect = page.locator(".nova-card select").first();
  const opts = await stockSelect.locator("option").count();
  if (opts > 1) {
    await stockSelect.selectOption({ index: 1 });
    await page.waitForTimeout(FAST);
  }
  // Quantité
  await page.locator(".nova-card input[type='number']").first().fill("30");
  await page.waitForTimeout(FAST);
  // Fournisseur
  await page.locator(".nova-card input[type='text']").first().fill("Brasseries du Cameroun").catch(() => {});
  await page.waitForTimeout(SLOW);

  await clickButton(page, "Valider l'entrée");
  await page.waitForTimeout(SLOW);

  // Onglet Alertes
  await page.locator("button").filter({ hasText: "Alertes" }).first().click();
  await page.waitForTimeout(READ);

  // ══════════════════════════════════════════════════════
  // 9. Fournisseurs
  // ══════════════════════════════════════════════════════
  await navSidebar(page, "Fournisseurs");
  await page.waitForTimeout(READ);

  // ══════════════════════════════════════════════════════
  // 10. Rapports
  // ══════════════════════════════════════════════════════
  await navSidebar(page, "Rapports");
  await page.waitForTimeout(READ);

  // ══════════════════════════════════════════════════════
  // 11. Clôture de caisse
  // ══════════════════════════════════════════════════════
  await navSidebar(page, "Clôture caisse");
  await page.waitForTimeout(READ);

  // Compter les billets
  const coupures = page.locator("input[type='number'][placeholder='0']");
  const n = await coupures.count();
  if (n >= 4) {
    await coupures.nth(0).fill("2"); // 2 × 10 000
    await page.waitForTimeout(300);
    await coupures.nth(1).fill("4"); // 4 × 5 000
    await page.waitForTimeout(300);
    await coupures.nth(2).fill("5"); // 5 × 2 000
    await page.waitForTimeout(300);
    await coupures.nth(3).fill("8"); // 8 × 1 000
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(SLOW);

  // Note de clôture
  const notes = page.locator("textarea[placeholder*='Observations']").first();
  if (await notes.isVisible({ timeout: 2000 }).catch(() => false)) {
    await notes.fill("Clôture fin de journée — tout est conforme.");
    await page.waitForTimeout(NORMAL);
  }
  await page.waitForTimeout(READ);

  // Valider la clôture
  await clickButton(page, "Valider la clôture");
  await page.waitForTimeout(SLOW);

  // Voir l'historique
  await page.locator("button").filter({ hasText: "Historique" }).first().click();
  await page.waitForTimeout(READ);

  // ══════════════════════════════════════════════════════
  // 12. Paramètres
  // ══════════════════════════════════════════════════════
  await navSidebar(page, "Paramètres");
  await page.waitForTimeout(READ);

  // ══════════════════════════════════════════════════════
  // 13. Déconnexion
  // ══════════════════════════════════════════════════════
  const logoutBtn = page.locator("button").filter({ hasText: /Déconnexion/i }).first();
  if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await logoutBtn.click();
    await page.waitForTimeout(SLOW);
  }
  await page.waitForTimeout(READ);
});
