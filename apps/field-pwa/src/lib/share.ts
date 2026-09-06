/** Partage d'une DI vers WhatsApp — message mis en forme, lisible et professionnel. */

const TYPE_LABEL: Record<string, string> = {
  PANNE_CRITIQUE: 'Panne critique',
  MAINTENANCE_PREVENTIVE: 'Maintenance préventive',
  DEMANDE_PIECE: 'Demande de pièce',
};

const URGENCY: Record<string, { label: string; dot: string }> = {
  N1_BLOQUANT: { label: 'P1 · Urgent', dot: '🔴' },
  N2_MAJEUR: { label: 'P2 · Important', dot: '🟠' },
  N3_MINEUR: { label: 'P3 · Normal', dot: '🟡' },
};

const STATUS_LABEL: Record<string, string> = {
  ENVOYEE: 'Envoyée — en attente du bureau',
  CREE: 'Créée',
  EN_ATTENTE: 'Reçue au bureau',
  QUALIFIE: 'Ordre de service qualifié',
  PLANIFIE: 'Planifiée',
  EN_COURS: 'En cours d’exécution',
  TRAVAUX_TERMINES: 'Travaux terminés',
  VALIDE_TERRAIN: 'Service fait',
  CLOTURE: 'Clôturée',
  ANNULE: 'Annulée',
};

export interface DiShare {
  reference: string;
  title: string;
  type?: string;
  urgency?: string;
  status?: string;
  description?: string;
  siteName?: string;
  assetName?: string;
  createdAtField?: string;
  reporterName?: string;
  /** photos jointes (disponibles juste après la prise) */
  photos?: File[];
}

const SEP = '━━━━━━━━━━━━━━━━━━';

export function buildDiMessage(d: DiShare): string {
  const u = d.urgency ? URGENCY[d.urgency] : undefined;
  const dt = d.createdAtField ? new Date(d.createdAtField) : null;
  const when = dt && !isNaN(dt.getTime())
    ? `${dt.toLocaleDateString('fr-FR')} à ${dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
    : null;

  const L: string[] = [];
  L.push('🔧 *DEMANDE D’INTERVENTION*');
  L.push(SEP);
  L.push(`📌 *Référence :* ${d.reference}`);
  if (d.status) L.push(`📍 *Statut :* ${STATUS_LABEL[d.status] ?? d.status}`);
  if (u) L.push(`${u.dot} *Priorité :* ${u.label}`);
  if (d.type) L.push(`🛠️ *Type :* ${TYPE_LABEL[d.type] ?? d.type}`);
  L.push('');
  if (d.siteName) L.push(`🏢 *Site :* ${d.siteName}`);
  if (d.assetName) L.push(`⚙️ *Équipement :* ${d.assetName}`);
  L.push(`📝 *Objet :* ${d.title}`);
  if (d.description?.trim()) {
    L.push('');
    L.push('*Détails :*');
    L.push(d.description.trim());
  }
  L.push('');
  if (when) L.push(`🗓️ *Signalée le :* ${when}`);
  if (d.reporterName) L.push(`👤 *Demandeur :* ${d.reporterName}`);
  L.push(SEP);
  L.push('_Émis via Belel GMAO_');
  return L.join('\n');
}

/** Ouvre WhatsApp (app sur mobile, WhatsApp Web sur ordinateur) avec le message pré-rempli. */
export function shareDiToWhatsApp(d: DiShare): void {
  const text = encodeURIComponent(buildDiMessage(d));
  window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
}

/**
 * Partage d'une DI.
 *  - avec photos + Web Share niveau 2 : feuille de partage native → WhatsApp
 *    reçoit le message ET les photos ensemble.
 *  - sinon : lien WhatsApp texte seul (comme avant).
 */
export async function shareDi(d: DiShare): Promise<void> {
  const text = buildDiMessage(d);
  const title = `Demande d’intervention ${d.reference}`;
  const files = (d.photos ?? []).filter(Boolean);
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;

  if (files.length && nav?.canShare?.({ files })) {
    try {
      await nav.share({ files, text, title });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      // sinon on retombe sur le partage texte
    }
  }
  if (!files.length && nav?.share) {
    try {
      await nav.share({ text, title });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  shareDiToWhatsApp(d);
}
