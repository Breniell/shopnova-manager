import { describe, it, expect } from 'vitest';
import {
  decodeCsvBytes, detectSeparator, parseCsv, parseAmount, mapColumns, buildPreview,
} from '@/lib/csvImport';
import type { Product } from '@/stores/useProductStore';

const NO_SHOP = { existingProducts: [] as Product[], existingCategories: ['Hygiène'] };

const preview = (text: string, options = NO_SHOP) =>
  buildPreview(text, detectSeparator(text.split('\n')[0]), 'utf-8', options);

describe('encodage - Excel n\'enregistre pas en UTF-8 par defaut', () => {
  const utf8 = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

  it('lit un fichier UTF-8 avec BOM, celui qu\'exportCSV produit', () => {
    const { text, encoding } = decodeCsvBytes(utf8('﻿Nom;Prix\nCafé;500'));
    expect(text.startsWith('Nom'), 'le BOM est resté dans la première cellule').toBe(true);
    expect(encoding).toBe('utf-8');
    expect(text).toContain('Café');
  });

  it('retombe sur windows-1252 quand Excel a ecrit en ANSI', () => {
    // « Café » en windows-1252 : le é est l'octet 0xE9, invalide en UTF-8.
    const ansi = new Uint8Array([0x43, 0x61, 0x66, 0xE9]); // C a f é
    const { text, encoding } = decodeCsvBytes(ansi.buffer);
    expect(encoding).toBe('windows-1252');
    expect(text, 'un nom accentué ressort illisible').toBe('Café');
  });

  it('ne casse pas un UTF-8 sans BOM', () => {
    const { text, encoding } = decodeCsvBytes(utf8('Hygiène'));
    expect(encoding).toBe('utf-8');
    expect(text).toBe('Hygiène');
  });
});

describe('separateur - Excel francais ecrit des points-virgules', () => {
  it('reconnait le point-virgule', () => {
    expect(detectSeparator('Nom;Prix;Stock')).toBe(';');
  });

  it('reconnait la virgule d\'un Excel anglophone', () => {
    expect(detectSeparator('Name,Price,Stock')).toBe(',');
  });

  it('ignore un separateur enferme dans des guillemets', () => {
    // Sans cette précaution, « Savon, grand format » ferait conclure à tort
    // que le fichier est séparé par des virgules.
    expect(detectSeparator('"Savon, grand format";Prix;Stock')).toBe(';');
  });
});

describe('nombres - « 1 500,00 » vaut 1500', () => {
  it('accepte les espaces de milliers, y compris insecables', () => {
    expect(parseAmount('1 500')).toBe(1500);
    expect(parseAmount('1 500')).toBe(1500);
    expect(parseAmount('1 500')).toBe(1500);
  });

  it('accepte la virgule decimale et arrondit au franc', () => {
    expect(parseAmount('1500,00')).toBe(1500);
    expect(parseAmount('1500,60')).toBe(1501);
  });

  it('rend null sur une cellule vide ou non numerique', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('gratuit')).toBeNull();
  });
});

describe('colonnes', () => {
  it('reconnait les libelles courants, accents et casse indifferents', () => {
    const map = mapColumns(['NOM', 'Catégorie', "Prix d'achat", 'PRIX DE VENTE', 'Qté']);
    expect(map.known.nom).toBe(0);
    expect(map.known.categorie).toBe(1);
    expect(map.known.prixAchat).toBe(2);
    expect(map.known.prixVente).toBe(3);
    expect(map.known.stock).toBe(4);
  });

  it('traite toute colonne inconnue comme un critere de declinaison', () => {
    const map = mapColumns(['Nom', 'Prix vente', 'Longueur', 'Couleur']);
    expect(map.axes.map(a => a.axis)).toEqual(['Longueur', 'Couleur']);
  });
});

describe('guillemets et retours a la ligne', () => {
  it('garde un separateur et un retour a la ligne echappes dans une cellule', () => {
    const rows = parseCsv('Nom;Description\n"Savon; grand";"ligne 1\nligne 2"\n', ';');
    expect(rows[1][0]).toBe('Savon; grand');
    expect(rows[1][1]).toBe('ligne 1\nligne 2');
  });

  it('restitue un guillemet double', () => {
    expect(parseCsv('Nom\n"Eau ""Supermont"""\n', ';')[1][0]).toBe('Eau "Supermont"');
  });
});

describe('lecture complete', () => {
  it('lit des produits ordinaires', () => {
    const result = preview('Nom;Categorie;Prix achat;Prix vente;Stock\nSavon;Hygiène;300;500;40\n');
    expect(result.issues).toEqual([]);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].axes).toEqual([]);
    expect(result.products[0].variants[0]).toMatchObject({ prixAchat: 300, prixVente: 500, stock: 40 });
  });

  it('applique les valeurs par defaut du seuil et du stock', () => {
    const result = preview('Nom;Prix vente\nSavon;500\n');
    expect(result.products[0].variants[0]).toMatchObject({ stock: 0, seuilAlerte: 5, prixAchat: 0 });
  });

  it('regroupe les lignes de meme nom en declinaisons', () => {
    // Le cas qui motive tout : 60 perruques saisies dans un tableur.
    const result = preview(
      'Nom;Prix achat;Prix vente;Stock;Longueur;Couleur\n'
      + 'Perruque Bob;8000;15000;4;12 pouces;Noir\n'
      + 'Perruque Bob;8000;15000;2;12 pouces;Brun\n'
      + 'Perruque Bob;11000;20000;3;16 pouces;Noir\n'
      + 'Savon;300;500;40;;\n',
    );
    expect(result.issues).toEqual([]);
    expect(result.products).toHaveLength(2);

    const wig = result.products.find(p => p.nom === 'Perruque Bob')!;
    expect(wig.axes).toEqual(['Longueur', 'Couleur']);
    expect(wig.variants).toHaveLength(3);
    expect(wig.variants[2]).toMatchObject({ prixVente: 20000, stock: 3 });

    const soap = result.products.find(p => p.nom === 'Savon')!;
    expect(soap.axes, 'un produit sans critère est devenu un parent').toEqual([]);
  });

  it('refuse deux declinaisons identiques', () => {
    const result = preview(
      'Nom;Prix vente;Longueur\nPerruque;15000;12 pouces\nPerruque;15000;12 pouces\n',
    );
    expect(result.issues.map(i => i.message)).toContain('duplicateVariant');
  });

  it('refuse deux fois le meme code-barres', () => {
    const result = preview('Nom;Prix vente;Code-barres\nA;500;123\nB;700;123\n');
    expect(result.issues.map(i => i.message)).toContain('duplicateBarcode');
  });

  it('signale une ligne sans prix de vente et garde les autres', () => {
    const result = preview('Nom;Prix vente\nSavon;500\nRiz;\n');
    expect(result.issues[0]).toMatchObject({ line: 3, message: 'missingSalePrice' });
    expect(result.products, 'une ligne fautive a fait perdre les lignes saines').toHaveLength(1);
  });

  it('signale un prix d\'achat superieur au prix de vente sans bloquer', () => {
    const result = preview('Nom;Prix achat;Prix vente\nSavon;900;500\n');
    expect(result.issues.map(i => i.message)).toContain('costAboveSale');
    expect(result.products).toHaveLength(1);
  });

  it('refuse un fichier sans les colonnes indispensables', () => {
    const result = preview('Truc;Machin\na;b\n');
    expect(result.issues[0].message).toBe('missingColumns');
    expect(result.products).toEqual([]);
  });

  it('repere les categories a creer', () => {
    const result = preview('Nom;Categorie;Prix vente\nSavon;Hygiène;500\nMèches;Beauté;9000\n');
    expect(result.newCategories, 'une catégorie déjà connue est proposée à la création')
      .toEqual(['Beauté']);
  });

  it('reconnait un produit deja present par son code-barres', () => {
    const existing: Product = {
      id: 'p1', nom: 'Ancien nom', categorie: 'Hygiène', codeBarre: '6901234567890',
      prixAchat: 300, prixVente: 500, stock: 10, seuilAlerte: 5,
    };
    const result = preview(
      'Nom;Prix vente;Code-barres\nSavon Azur;600;6901234567890\n',
      { existingProducts: [existing], existingCategories: ['Hygiène'] },
    );
    expect(result.products[0].existing?.id, 'le doublon par code-barres n\'est pas vu').toBe('p1');
  });

  it('reconnait un produit deja present par son nom, accents et casse indifferents', () => {
    const existing: Product = {
      id: 'p2', nom: 'Café moulu', categorie: 'Alimentation', codeBarre: '',
      prixAchat: 1000, prixVente: 1500, stock: 5, seuilAlerte: 2,
    };
    const result = preview(
      'Nom;Prix vente\nCAFE MOULU;1800\n',
      { existingProducts: [existing], existingCategories: [] },
    );
    expect(result.products[0].existing?.id).toBe('p2');
  });

  it('ignore les lignes entierement vides que les tableurs laissent en fin de fichier', () => {
    const result = preview('Nom;Prix vente\nSavon;500\n;;\n\n');
    expect(result.products).toHaveLength(1);
    expect(result.issues).toEqual([]);
  });
});
