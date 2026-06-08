/**
 * src/lib/consent.ts — Gestion des consentements explicites de l'utilisateur.
 *
 * Séparé de l'acceptation globale de la politique : certains traitements
 * (comme l'envoi de la position GPS de la boutique à la plateforme de l'éditeur)
 * exigent un consentement *distinct, optionnel et révocable*.
 *
 * Le consentement est stocké localement. Tant qu'il n'est pas explicitement
 * accordé, aucune donnée de localisation n'est transmise.
 */

const GEO_CONSENT_KEY = 'legwan-geo-consent';

/** True si l'utilisateur a explicitement autorisé l'envoi de sa position. */
export function hasGeoConsent(): boolean {
  try {
    return localStorage.getItem(GEO_CONSENT_KEY) === 'granted';
  } catch {
    return false;
  }
}

/** Enregistre le choix de l'utilisateur concernant la géolocalisation. */
export function setGeoConsent(granted: boolean): void {
  try {
    localStorage.setItem(GEO_CONSENT_KEY, granted ? 'granted' : 'denied');
  } catch {
    /* localStorage indisponible */
  }
}

/** True si l'utilisateur a déjà répondu (accordé OU refusé) à la question géoloc. */
export function hasAnsweredGeoConsent(): boolean {
  try {
    return localStorage.getItem(GEO_CONSENT_KEY) !== null;
  } catch {
    return false;
  }
}