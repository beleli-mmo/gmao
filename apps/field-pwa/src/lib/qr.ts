import { localRef } from '../db/pouch';

/**
 * Format d'encodage QR posé sur le matériel : `GMAO:<assetTag>` (ex. `GMAO:ENG-0007`).
 * On tolère aussi :
 *  - une URL profonde  `https://gmao.example/e/ENG-0007`
 *  - un JSON compact    `{"t":"eq","tag":"ENG-0007"}`
 *  - la valeur brute de l'assetTag seule
 */
export interface ParsedQr {
  raw: string;
  assetTag: string | null;
}

export function parseQrPayload(raw: string): ParsedQr {
  const value = raw.trim();

  if (value.startsWith('GMAO:')) return { raw: value, assetTag: value.slice(5).trim() || null };

  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      const last = u.pathname.split('/').filter(Boolean).pop();
      return { raw: value, assetTag: last ?? null };
    } catch {
      /* ignore */
    }
  }

  if (value.startsWith('{')) {
    try {
      const o = JSON.parse(value);
      const tag = o.tag ?? o.assetTag ?? o.a ?? null;
      return { raw: value, assetTag: tag };
    } catch {
      /* ignore */
    }
  }

  // valeur brute : on suppose que c'est l'assetTag
  return { raw: value, assetTag: value || null };
}

export interface ResolvedEquipment {
  id: string;
  _id: string;
  assetTag: string;
  name: string;
  kind?: string;
  meterKind?: 'HEURES' | 'KM' | 'NONE';
  currentMeter?: number;
  siteId?: string;
  qrPayload?: string;
}

/**
 * Résout un QR en engin depuis le référentiel local (PouchDB `gmao_ref`),
 * donc **utilisable hors ligne**. Compare sur `qrPayload` exact puis sur `assetTag`.
 */
export async function resolveEquipmentFromQr(raw: string): Promise<ResolvedEquipment | null> {
  const { assetTag } = parseQrPayload(raw);
  const res = await localRef.allDocs({ include_docs: true });
  const equipments = res.rows
    .map((r) => r.doc as unknown as ResolvedEquipment & { type?: string })
    .filter((d) => d && (d as any).type === 'equipment');

  return (
    equipments.find((e) => e.qrPayload && e.qrPayload === raw.trim()) ??
    (assetTag ? equipments.find((e) => e.assetTag === assetTag) ?? null : null)
  );
}
