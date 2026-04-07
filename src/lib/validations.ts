import { z } from 'zod';

export const productSchema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  categorie: z.string(),
  codeBarre: z.string(),
  prixAchat: z.number().positive('Le prix d\'achat doit être supérieur à 0'),
  prixVente: z.number().positive('Le prix de vente doit être supérieur à 0'),
  stock: z.number().int().min(0, 'Le stock ne peut pas être négatif'),
  seuilAlerte: z.number().int().min(0, 'Le seuil ne peut pas être négatif'),
  description: z.string().optional(),
}).refine(data => data.prixVente >= data.prixAchat, {
  message: 'Le prix de vente doit être ≥ au prix d\'achat',
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
