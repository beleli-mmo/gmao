import { useEffect, useState } from 'react';
import { useQrScanner } from '../hooks/useQrScanner';
import { resolveEquipmentFromQr, parseQrPayload, type ResolvedEquipment } from '../lib/qr';
import './qr-scanner.css';

interface Props {
  /** Appelé quand un QR est résolu (engin trouvé) OU quand l'utilisateur valide une saisie manuelle. */
  onIdentified: (payload: { qrPayload: string; equipment: ResolvedEquipment | null }) => void;
  onCancel: () => void;
}

/**
 * Écran plein cadre de scan QR pour identifier un engin.
 * Flux : caméra → détection → résolution locale (offline) → confirmation.
 * Replis : saisie manuelle de l'assetTag, torche, message si permission refusée.
 */
export function QrScanner({ onIdentified, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const [hit, setHit] = useState<{ raw: string; equipment: ResolvedEquipment | null; unknown: boolean } | null>(null);
  const [manual, setManual] = useState('');
  const [showManual, setShowManual] = useState(false);

  async function handleValue(raw: string) {
    if (busy || hit) return;
    setBusy(true);
    try {
      const equipment = await resolveEquipmentFromQr(raw);
      setHit({ raw: raw.trim(), equipment, unknown: !equipment });
    } finally {
      setBusy(false);
    }
  }

  const { videoRef, status, error, torchOn, torchSupported, toggleTorch } = useQrScanner({
    onResult: handleValue,
    paused: Boolean(hit) || showManual,
  });

  // auto-confirme après 1,2 s si un engin est trouvé (l'utilisateur voit la fiche)
  useEffect(() => {
    if (hit?.equipment) {
      const t = setTimeout(() => onIdentified({ qrPayload: hit.raw, equipment: hit.equipment }), 1200);
      return () => clearTimeout(t);
    }
  }, [hit, onIdentified]);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const raw = manual.trim();
    if (raw.length < 2) return;
    handleValue(raw.startsWith('GMAO:') ? raw : `GMAO:${raw}`);
    setShowManual(false);
  }

  return (
    <div className="qr">
      <div className="qr-stage">
        <video ref={videoRef} className="qr-video" playsInline muted />
        <div className="qr-frame" aria-hidden>
          <span /><span /><span /><span />
        </div>

        <button type="button" className="qr-close" onClick={onCancel} aria-label="Fermer">✕</button>
        {torchSupported && (
          <button type="button" className={`qr-torch ${torchOn ? 'is-on' : ''}`} onClick={toggleTorch}>
            {torchOn ? '🔦 Éteindre' : '🔦 Lampe'}
          </button>
        )}

        <p className="qr-tip">
          {status === 'scanning' && !hit && 'Visez le QR code collé sur l’engin'}
          {status === 'starting' && 'Démarrage de la caméra…'}
          {busy && 'Lecture…'}
        </p>
      </div>

      {/* erreurs caméra */}
      {(status === 'denied' || status === 'unavailable' || status === 'error') && (
        <div className="qr-panel qr-panel--error">
          <p>{error}</p>
          <button type="button" className="qr-btn" onClick={() => setShowManual(true)}>
            Saisir la référence manuellement
          </button>
        </div>
      )}

      {/* résultat */}
      {hit && (
        <div className={`qr-panel ${hit.equipment ? 'qr-panel--ok' : 'qr-panel--warn'}`}>
          {hit.equipment ? (
            <>
              <strong>{hit.equipment.name}</strong>
              <span>Engin identifié — ouverture du ticket…</span>
            </>
          ) : (
            <>
              <strong>QR non reconnu dans le référentiel</strong>
              <span className="qr-raw">{parseQrPayload(hit.raw).assetTag ?? hit.raw}</span>
              <div className="qr-actions">
                <button type="button" className="qr-btn qr-btn--ghost" onClick={() => setHit(null)}>
                  Rescanner
                </button>
                <button
                  type="button"
                  className="qr-btn"
                  onClick={() => onIdentified({ qrPayload: hit.raw, equipment: null })}
                >
                  Continuer sans engin lié
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* saisie manuelle */}
      {showManual && (
        <form className="qr-panel" onSubmit={submitManual}>
          <label className="qr-manual">
            <span>Référence de l’engin (ex. ENG-0007)</span>
            <input
              autoFocus
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="ENG-0007"
              inputMode="text"
              autoCapitalize="characters"
            />
          </label>
          <div className="qr-actions">
            <button type="button" className="qr-btn qr-btn--ghost" onClick={() => setShowManual(false)}>
              Annuler
            </button>
            <button type="submit" className="qr-btn">Valider</button>
          </div>
        </form>
      )}

      {!hit && !showManual && status === 'scanning' && (
        <button type="button" className="qr-manual-link" onClick={() => setShowManual(true)}>
          Pas de QR ? Saisir la référence
        </button>
      )}
    </div>
  );
}
