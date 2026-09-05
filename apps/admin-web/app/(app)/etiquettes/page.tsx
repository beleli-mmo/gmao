'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { endpoints, type Equipment } from '@/lib/api';

/** Contenu encodé dans le QR posé sur l'actif. */
const qrValue = (e: Equipment) => e.qrPayload || `GMAO:${e.assetTag}`;

export default function EtiquettesPage() {
  const equip = useQuery({ queryKey: ['equipment', 'all'], queryFn: () => endpoints.equipmentList() });
  const lots = useQuery({ queryKey: ['lots'], queryFn: () => endpoints.lotsList() });
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => endpoints.sitesList() });

  const [lotId, setLotId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [q, setQ] = useState('');
  const [size, setSize] = useState<'S' | 'M' | 'L'>('M');

  const lotCode = lots.data?.data.find((l) => l.id === lotId)?.code;
  const siteCode = sites.data?.data.find((s) => s.id === siteId)?.code;

  const rows = useMemo(() => {
    const all = equip.data?.data ?? [];
    const needle = q.trim().toLowerCase();
    return all.filter((e) => {
      if (lotCode && e.lot?.code !== lotCode) return false;
      if (siteCode && e.site?.code !== siteCode) return false;
      if (needle && !`${e.name} ${e.assetTag}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [equip.data, lotCode, siteCode, q]);

  const qrPx = size === 'S' ? 96 : size === 'L' ? 168 : 128;

  return (
    <>
      <div className="shell-head no-print">
        <h1>Étiquettes QR</h1>
        <button type="button" className="btn" onClick={() => window.print()} disabled={!rows.length}>
          🖨 Imprimer {rows.length ? `(${rows.length})` : ''}
        </button>
      </div>

      <div className="toolbar no-print">
        <input placeholder="Rechercher un actif…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          <option value="">Tous les projets</option>
          {sites.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={lotId} onChange={(e) => setLotId(e.target.value)}>
          <option value="">Tous les lots</option>
          {lots.data?.data.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select value={size} onChange={(e) => setSize(e.target.value as 'S' | 'M' | 'L')}>
          <option value="S">Petites étiquettes</option>
          <option value="M">Étiquettes moyennes</option>
          <option value="L">Grandes étiquettes</option>
        </select>
      </div>

      <p className="muted no-print" style={{ marginTop: -4 }}>
        Chaque QR encode <code>GMAO:référence</code> — scannable hors ligne par l’app terrain. Collez l’étiquette sur l’actif.
      </p>

      {equip.isLoading ? (
        <p className="muted">Chargement…</p>
      ) : !rows.length ? (
        <p className="muted">Aucun actif pour ce filtre.</p>
      ) : (
        <div className={`labels-sheet labels-${size}`}>
          {rows.map((e) => (
            <div key={e.id} className="label-card">
              <QRCodeSVG value={qrValue(e)} size={qrPx} level="M" marginSize={2} />
              <div className="label-txt">
                <strong>{e.name}</strong>
                <span className="label-tag">{e.assetTag}</span>
                <span className="label-meta">
                  {e.site?.name ?? '—'}
                  {e.lot ? <> · <span style={{ color: e.lot.color }}>{e.lot.name}</span></> : null}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
