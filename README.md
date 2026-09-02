# GMAO — Maintenance & Exploitation multi‑technique

Progiciel de GMAO offline‑first pour la **maintenance et l'exploitation d'installations
techniques de bâtiments** (ascenseurs, sécurité incendie, plomberie, électricité HT/BT,
groupes électrogènes, lots architecturaux, nettoyage), aligné sur la procédure interne
« Cahier de Maintenance & d'Exploitation ».

Voir [`ARCHITECTURE.md`](./ARCHITECTURE.md) pour l'architecture détaillée et l'arborescence.

### Alignement sur la procédure

| Exigence procédure | Implémentation |
|---|---|
| Arborescence Projet → Zone/Niveau → Lot → Actif | `Site` → `Equipment.zone` → `TechnicalLot` → `Equipment` ; référence `[PROJET]-[LOT]-[ZONE]-[TYPE]-[N°]` |
| Segmentation en lots techniques | modèle `TechnicalLot` (ASC, SSI, PLB, ELC, GE, ARC, NET), imputation des coûts par lot |
| Workflow DI → OS/BT → Exécution & CR → Réception & Clôture | machine à états `EN_ATTENTE → QUALIFIE → PLANIFIE → EN_COURS → TRAVAUX_TERMINES → VALIDE_TERRAIN → CLOTURE` ; référence `DI-AAAA-NNNNNN` |
| Priorités P1 / P2 / P3 | champ `urgency` (libellés P1 Urgent / P2 Important / P3 Normal) |
| Fréquences préventives (Quotidien → Quinquennal) | `PreventivePlan` + `TechnicalLot.defaultFrequency` |
| KPI **TRPP** (> 95 %) | `Ticket.dueDate` + `/api/analytics/trpp` (global et par lot) |
| KPI **MTTR** | `/api/analytics/reliability` |
| Répartition des coûts par lot et par projet | `/api/analytics/cost-by-lot` + `/api/analytics/cost-by-site` |
| Carnet de santé de l'équipement | page `/parc/[id]` (identification, plan préventif, historiques préventif/curatif, coût de possession) |

## Démarrage rapide — mode DEV local (sans Docker)

Pour développer l'API + l'admin web sans aucune infrastructure : **SQLite** via le schéma
[`apps/api/prisma/schema.dev.prisma`](./apps/api/prisma/schema.dev.prisma). La synchro
CouchDB/PouchDB (nécessaire seulement à la PWA terrain) est mise de côté.

```bash
npm install

# base SQLite : génère le client, crée apps/api/prisma/dev.db, insère les données de démo
npm -w apps/api run db:local:setup

# services
npm -w apps/api      run dev     # API REST + WebSocket   :4000  (DATABASE_URL="file:./dev.db")
npm -w apps/admin-web run dev     # dashboard admin        :3000
```

Puis http://localhost:3000 → `parc@gmao.local` / `gmao1234`.
Données de démo (`prisma/seed.ts`) : 7 lots techniques, 3 projets (Siège Almadies, Sea Plaza,
Résidence Les Filaos), 12 actifs (ascenseurs, centrale SSI, surpresseur, TGBT, GE 250 kVA…),
13 DI couvrant tout le workflow dont 7 préventifs à échéance (TRPP ≈ 71 %), coûts imputés par
lot et par projet, plans préventifs réglementaires, stock avec alertes.
`apps/api/.env` pointe déjà sur SQLite ; repasser sur PostgreSQL = décommenter la ligne
`DATABASE_URL` correspondante (le schéma de référence `schema.prisma` est à jour).

## Démarrage complet — stack de production (PostgreSQL + CouchDB + MinIO)

```bash
# 1. infrastructure locale (PostgreSQL + CouchDB + MinIO)
docker compose up -d

# 2. dépendances
npm install

# 3. base de données
cp .env.example apps/api/.env
npm run db:migrate
npm run db:seed

# 4. bases CouchDB + design docs
curl -X PUT  http://admin:admin@localhost:5984/field-tickets
curl -X PUT  http://admin:admin@localhost:5984/field-ref
curl -X PUT  http://admin:admin@localhost:5984/sync-meta
curl -X POST http://admin:admin@localhost:5984/field-tickets \
  -H 'Content-Type: application/json' \
  -d @infra/couchdb/field-tickets.design.json

# 5. services (4 terminaux)
npm run dev:api       # REST + WebSocket  :4000
npm run dev:ingest    # worker CouchDB → PostgreSQL
npm run dev:pwa       # PWA terrain       :5173
npm run dev:admin     # dashboard admin   :3000
```

Comptes de démo (`prisma/seed.ts`) — mot de passe `gmao1234` :

| Rôle | Email |
|---|---|
| Administrateur | `admin@gmao.local` |
| Chef de chantier | `chef@gmao.local` |
| Responsable parc | `parc@gmao.local` |
| Mécanicien | `meca@gmao.local` |

Depuis l'admin web, page **Équipe & accès** (`/equipe`) : création de comptes, attribution de rôle,
activation/désactivation, réinitialisation de mot de passe.

## Livrables de ce dépôt

| # | Livrable | Emplacement |
|---|---|---|
| 1 | Structure monorepo | `ARCHITECTURE.md` + arborescence `apps/` `packages/` |
| 2 | Schéma PostgreSQL complet | [`apps/api/prisma/schema.prisma`](./apps/api/prisma/schema.prisma) |
| 3 | Endpoints API + workflow | [`apps/api/src/modules/*.routes.ts`](./apps/api/src/modules), machine à états [`state-machine.ts`](./packages/shared/src/state-machine.ts) |
| 3b | Logique de synchro offline | [`apps/api/src/sync/couch-ingest.worker.ts`](./apps/api/src/sync/couch-ingest.worker.ts), [`apps/field-pwa/src/db/pouch.ts`](./apps/field-pwa/src/db/pouch.ts), [`outbox.ts`](./apps/field-pwa/src/db/outbox.ts) |
| 4 | Composant PWA création ticket | [`apps/field-pwa/src/components/TicketCreateForm.tsx`](./apps/field-pwa/src/components/TicketCreateForm.tsx) |
| 4b | Scan QR d'identification engin | [`apps/field-pwa/src/components/QrScanner.tsx`](./apps/field-pwa/src/components/QrScanner.tsx), [`hooks/useQrScanner.ts`](./apps/field-pwa/src/hooks/useQrScanner.ts), [`lib/qr.ts`](./apps/field-pwa/src/lib/qr.ts) |
| 5 | Imputation analytique des coûts | [`apps/api/src/lib/cost-imputation.ts`](./apps/api/src/lib/cost-imputation.ts) + [`analytics.routes.ts`](./apps/api/src/modules/analytics.routes.ts) |
| 6 | Admin web (Next.js 14) | [`apps/admin-web/`](./apps/admin-web) — dashboard, workflow tickets, parc, planning, stocks, analytique + WebSocket temps réel |

## Flux de synchronisation (résumé)

1. Le chef de chantier crée un ticket → écrit dans **PouchDB** local (`ticket:<uuid>`), photos en pièces jointes.
2. Dès qu'il y a du réseau, PouchDB réplique vers **CouchDB** `field-tickets` (bidirectionnel, filtré sur le reporter).
3. Le **worker d'ingestion** lit le flux `_changes`, valide (Zod + machine à états), déporte les médias vers **MinIO**, et fait l'`upsert` dans **PostgreSQL** (idempotent via `clientId` + `SyncLog`).
4. L'admin lit PostgreSQL via **REST** et reçoit les changements de statut en direct via **WebSocket**.
5. Le référentiel descendant (chantiers, parc, pièces) est projeté PostgreSQL → CouchDB `field-ref`, répliqué en lecture seule vers le terrain.
