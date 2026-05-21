import { z } from 'zod';

export const productSchema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  categorie: z.string(),
  codeBarre: z.string(),
  prixAchat: z.number().positive('Le prix d\'achat doit être supérieur à 0'),
  prixVente: z.number().positive('Le prix de vente doit être supérieur à 0'),
  prixCible: z.number().positive('Le prix cible doit être positif').optional(),
  prixPlancher: z.number().positive('Le prix plancher doit être positif').optional(),
  negociable: z.boolean().optional(),
  stock: z.number().int().min(0, 'Le stock ne peut pas être négatif'),
  seuilAlerte: z.number().int().min(0, 'Le seuil ne peut pas être négatif'),
  description: z.string().optional(),
})
.refine(data => data.prixVente >= data.prixAchat, {
  message: 'Le prix de vente doit être ≥ au prix d\'achat',
  path: ['prixVente'],
})
.refine(data => !data.prixPlancher || data.prixPlancher >= data.prixAchat, {
  message: 'Le prix plancher devrait être ≥ au prix d\'achat (sinon vente à perte)',
  path: ['prixPlancher'],
})
.refine(data => !data.prixCible || !data.prixPlancher || data.prixCible >= data.prixPlancher, {
  message: 'Le prix cible doit être ≥ au prix plancher',
  path: ['prixCible'],
})
.refine(data => !data.prixCible || data.prixVente >= data.prixCible, {
  message: 'Le prix de vente doit être ≥ au prix cible',
  path: ['prixVente'],
});

export const userSchema = z.object({
  prenom: z.string().min(2, 'Prénom requis (2 caractères min.)'),
  nom: z.string().min(2, 'Nom requis (2 caractères min.)'),
  role: z.enum(['gérant', 'caissier']),
  pin: z.string().length(4, 'Le PIN doit contenir 4 chiffres').regex(/^\d{4}$/, 'Chiffres uniquement'),
});

export const supplierSchema = z.object({
  nom: z.string().min(2, 'Nom requis'),
  telephone: z.string().min(9, 'Numéro invalide (9 chiffres min.)'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  adresse: z.string().optional(),
  notes: z.string().optional(),
});

export const customerSchema = z.object({
  prenom: z.string().min(2, 'Prénom requis (2 caractères min.)'),
  nom: z.string().min(1, 'Nom requis'),
  telephone: z.string()
    .min(9, 'Numéro invalide (9 chiffres min.)')
    .regex(/^[0-9+\s\-.()]+$/, 'Format invalide (chiffres, espaces, + uniquement)'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  adresse: z.string().optional(),
  notes: z.string().optional(),
  plafondCredit: z.number().min(0, 'Le plafond ne peut pas être négatif').optional(),
});

export const expenseSchema = z.object({
  categorie: z.enum([
    'loyer', 'electricite', 'eau', 'internet_telephone', 'transport',
    'salaires', 'achats_marchandises', 'maintenance', 'marketing',
    'taxes_impots', 'frais_bancaires', 'autre',
  ]),
  description: z.string()
    .min(1, 'Description requise')
    .max(200, 'Description trop longue (200 caractères max.)'),
  montant: z.number().positive('Le montant doit être supérieur à 0'),
  paymentMode: z.enum(['especes', 'mobile_money', 'virement', 'cheque']),
  beneficiaire: z.string().max(100).optional(),
  reference: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
});

export const shopSettingsSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  adresse: z.string().min(1, 'L\'adresse est requise'),
  telephone: z.string().min(9, 'Téléphone invalide'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  nui: z.string().optional(),
  enteteRecu: z.string().optional(),
  piedPageRecu: z.string().optional(),
  devise: z.string(),
});
