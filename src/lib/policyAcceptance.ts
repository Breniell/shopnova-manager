/**
 * Acceptation de la politique de confidentialité.
 *
 * La politique a sa propre révision, indépendante du numéro de version du
 * logiciel. Elle était auparavant confondue avec `__APP_VERSION__` : chaque mise
 * à jour invalidait l'acceptation et redemandait de signer un texte inchangé,
 * comme une réinstallation.
 *
 * Ne changer POLICY_REVISION que lorsque le TEXTE de la politique change de
 * façon importante : c'est le seul cas où les utilisateurs doivent la relire.
 */
export const POLICY_REVISION = '1.0';

export interface PolicyRecord {
  /** Version du logiciel au moment de la signature (traçabilité uniquement). */
  version?: string;
  /** Révision de la politique acceptée. Absente des enregistrements antérieurs. */
  policyRevision?: string;
  accepted: boolean;
  name: string;
  date: string;
}

/**
 * Vrai si l'enregistrement local vaut acceptation de la politique en vigueur.
 *
 * Un enregistrement sans `policyRevision` date d'avant cette séparation : il a
 * été signé sur une version du logiciel, pour le même texte. On le conserve.
 */
export function isPolicyRecordValid(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const record = JSON.parse(raw) as Partial<PolicyRecord> | null;
    if (!record || record.accepted !== true) return false;
    return record.policyRevision === undefined || record.policyRevision === POLICY_REVISION;
  } catch {
    return false;
  }
}

export function buildPolicyRecord(name: string, appVersion: string, now: Date = new Date()): PolicyRecord {
  return {
    version: appVersion,
    policyRevision: POLICY_REVISION,
    accepted: true,
    name: name.trim(),
    date: now.toISOString(),
  };
}
