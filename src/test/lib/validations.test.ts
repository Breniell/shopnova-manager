import { describe, it, expect } from 'vitest';
import { productSchema, userSchema, supplierSchema, shopSettingsSchema } from '@/lib/validations';

// ─── productSchema ────────────────────────────────────────────────────────────
describe('productSchema', () => {
  const validProduct = {
    nom: 'Coca-Cola 33cl',
    categorie: 'Boissons',
    codeBarre: '6901234567890',
    prixAchat: 350,
    prixVente: 500,
    stock: 24,
    seuilAlerte: 6,
  };

  it('accepts a valid product', () => {
    expect(productSchema.safeParse(validProduct).success).toBe(true);
  });

  it('rejects name shorter than 2 characters', () => {
    const result = productSchema.safeParse({ ...validProduct, nom: 'A' });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.flatten().fieldErrors.nom).toBeDefined();
  });

  it('rejects negative purchase price', () => {
    const result = productSchema.safeParse({ ...validProduct, prixAchat: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects zero sale price', () => {
    const result = productSchema.safeParse({ ...validProduct, prixVente: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative stock', () => {
    const result = productSchema.safeParse({ ...validProduct, stock: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects when sale price < purchase price', () => {
    const result = productSchema.safeParse({ ...validProduct, prixAchat: 600, prixVente: 400 });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.flatten().fieldErrors.prixVente).toBeDefined();
  });

  it('accepts when sale price === purchase price (break-even)', () => {
    expect(productSchema.safeParse({ ...validProduct, prixAchat: 500, prixVente: 500 }).success).toBe(true);
  });

  it('accepts optional description', () => {
    expect(productSchema.safeParse({ ...validProduct, description: 'Une boisson fraîche' }).success).toBe(true);
  });

  it('accepts when description is absent', () => {
    const { description: _, ...noDesc } = { ...validProduct, description: undefined };
    expect(productSchema.safeParse(noDesc).success).toBe(true);
  });
});

// ─── userSchema ───────────────────────────────────────────────────────────────
describe('userSchema', () => {
  const validUser = {
    prenom: 'Marie',
    nom: 'Nguema',
    role: 'gérant' as const,
    pin: '1234',
  };

  it('accepts a valid user', () => {
    expect(userSchema.safeParse(validUser).success).toBe(true);
  });

  it('accepts caissier role', () => {
    expect(userSchema.safeParse({ ...validUser, role: 'caissier' }).success).toBe(true);
  });

  it('rejects unknown role', () => {
    expect(userSchema.safeParse({ ...validUser, role: 'admin' }).success).toBe(false);
  });

  it('rejects PIN with fewer than 4 digits', () => {
    expect(userSchema.safeParse({ ...validUser, pin: '123' }).success).toBe(false);
  });

  it('rejects PIN with more than 4 digits', () => {
    expect(userSchema.safeParse({ ...validUser, pin: '12345' }).success).toBe(false);
  });

  it('rejects PIN with letters', () => {
    expect(userSchema.safeParse({ ...validUser, pin: '12ab' }).success).toBe(false);
  });

  it('rejects first name shorter than 2 chars', () => {
    expect(userSchema.safeParse({ ...validUser, prenom: 'A' }).success).toBe(false);
  });

  it('rejects surname shorter than 2 chars', () => {
    expect(userSchema.safeParse({ ...validUser, nom: 'N' }).success).toBe(false);
  });
});

// ─── supplierSchema ───────────────────────────────────────────────────────────
describe('supplierSchema', () => {
  const validSupplier = {
    nom: 'Brasseries du Cameroun',
    telephone: '+237699111222',
  };

  it('accepts a valid supplier', () => {
    expect(supplierSchema.safeParse(validSupplier).success).toBe(true);
  });

  it('rejects name shorter than 2 chars', () => {
    expect(supplierSchema.safeParse({ ...validSupplier, nom: 'A' }).success).toBe(false);
  });

  it('rejects phone shorter than 9 chars', () => {
    expect(supplierSchema.safeParse({ ...validSupplier, telephone: '12345678' }).success).toBe(false);
  });

  it('accepts a valid email', () => {
    expect(supplierSchema.safeParse({ ...validSupplier, email: 'contact@brasseries.cm' }).success).toBe(true);
  });

  it('accepts empty string email (optional)', () => {
    expect(supplierSchema.safeParse({ ...validSupplier, email: '' }).success).toBe(true);
  });

  it('rejects malformed email', () => {
    expect(supplierSchema.safeParse({ ...validSupplier, email: 'not-an-email' }).success).toBe(false);
  });

  it('accepts optional address and notes', () => {
    expect(supplierSchema.safeParse({ ...validSupplier, adresse: 'Douala', notes: 'VIP' }).success).toBe(true);
  });
});

// ─── shopSettingsSchema ───────────────────────────────────────────────────────
describe('shopSettingsSchema', () => {
  const validSettings = {
    nom: 'Legwan Store',
    adresse: 'Rue de la Joie, Douala',
    telephone: '+237699123456',
    devise: 'FCFA',
  };

  it('accepts valid settings', () => {
    expect(shopSettingsSchema.safeParse(validSettings).success).toBe(true);
  });

  it('rejects empty shop name', () => {
    expect(shopSettingsSchema.safeParse({ ...validSettings, nom: '' }).success).toBe(false);
  });

  it('rejects empty address', () => {
    expect(shopSettingsSchema.safeParse({ ...validSettings, adresse: '' }).success).toBe(false);
  });

  it('rejects phone shorter than 9 chars', () => {
    expect(shopSettingsSchema.safeParse({ ...validSettings, telephone: '123' }).success).toBe(false);
  });

  it('accepts a valid optional email', () => {
    expect(shopSettingsSchema.safeParse({ ...validSettings, email: 'shop@nova.cm' }).success).toBe(true);
  });

  it('accepts empty email string', () => {
    expect(shopSettingsSchema.safeParse({ ...validSettings, email: '' }).success).toBe(true);
  });

  it('rejects malformed email', () => {
    expect(shopSettingsSchema.safeParse({ ...validSettings, email: 'bad-email' }).success).toBe(false);
  });

  it('accepts optional nui, enteteRecu, piedPageRecu', () => {
    expect(shopSettingsSchema.safeParse({
      ...validSettings,
      nui: 'M123456',
      enteteRecu: 'Bienvenue !',
      piedPageRecu: 'Merci !',
    }).success).toBe(true);
  });
});
