# GMAO BTP — Architecture & arborescence

Progiciel de Gestion de la Maintenance Assistée par Ordinateur, **offline‑first**, pour une
entreprise de BTP multi‑chantiers.

## 1. Choix techniques

| Couche | Techno | Justification |
|---|---|---|
| PWA terrain | React 18 + Vite + TypeScript, `vite-plugin-pwa` (Workbox) | Build léger, service worker généré, install mobile |
| Base locale terrain | **PouchDB** (adapter IndexedDB) | Réplication bidirectionnelle native avec CouchDB, gestion des pièces jointes (photos) |
| Admin web | Next.js 14 (App Router) + TanStack Query + Recharts | SSR pour le dashboard, tables et graphes analytiques |
| API | **Node.js + Express + TypeScript** (Zod pour la validation) | Simplicité de lecture de la logique de synchro ; NestJS possible sans changer le modèle |
| Temps réel | WebSocket (`ws`) — push des changements de statut de ticket vers l'admin | |
| Stockage relationnel | **PostgreSQL 16** via **Prisma** | Source de vérité pour l'analytique, les coûts, le parc |
| Couche de synchro | **CouchDB 3** | Endpoint de réplication PouchDB ; un worker Node lit le flux `_changes` et projette dans PostgreSQL |
| Fichiers lourds | S3 / MinIO (les photos transitent d'abord comme pièces jointes CouchDB puis sont déportées) | |
| Auth | JWT court (15 min) + refresh token ; rôles `FIELD_MANAGER`, `PARK_MANAGER`, `MECHANIC`, `ADMIN` | |

### Modèle de synchronisation (hybride)

```
[PWA terrain]                       [Serveur]
 PouchDB  ──(réplication CouchDB)──▶  CouchDB  ──(flux _changes)──▶  Worker d'ingestion ──▶ PostgreSQL
   ▲                                    │                                                      │
   └──────────(pull des maj)────────────┘                                                      │
[Admin web] ◀──── REST + WebSocket (lecture PostgreSQL, source de vérité analytique) ◀─────────┘
```

- **Le terrain n'écrit jamais directement dans PostgreSQL.** Il écrit dans PouchDB, qui réplique vers
  CouchDB. Le worker valide chaque document (machine à états, schéma Zod, idempotence via `clientId`)
  puis fait un `upsert` dans PostgreSQL.
- **Conflits** : stratégie *last‑write‑wins* de CouchDB pour les brouillons terrain ; le worker
  applique en plus une machine à états qui **rejette les transitions illégales** (ex. un chef de
  chantier ne peut pas passer un ticket à `CLÔTURÉ`).
- **Référentiel descendant** (liste chantiers, parc matériel, catalogue pièces) : une base CouchDB
  en lecture seule répliquée vers le terrain, alimentée par un projecteur PostgreSQL → CouchDB.

## 2. Arborescence (monorepo, npm workspaces)

```
gmao-btp/
├── package.json                     # workspaces: apps/*, packages/*
├── docker-compose.yml               # postgres + couchdb + minio
├── .env.example
├── ARCHITECTURE.md
│
├── packages/
│   └── shared/                      # types + enums + schémas Zod partagés API ⇄ PWA
│       └── src/
│           ├── enums.ts             # TicketStatus, Urgency, TicketType, EquipmentStatus…
│           ├── dto.ts               # schémas Zod (createTicket, meterReading…)
│           └── state-machine.ts     # transitions autorisées + rôles
│
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma        # ← schéma complet PostgreSQL
│   │   │   └── seed.ts
│   │   └── src/
│   │       ├── server.ts            # bootstrap Express + WS
│   │       ├── prisma.ts
│   │       ├── auth/
│   │       │   ├── auth.routes.ts
│   │       │   └── auth.middleware.ts   # requireAuth / requireRole
│   │       ├── modules/
│   │       │   ├── equipment.routes.ts  # CRUD parc + VGP/révisions
│   │       │   ├── tickets.routes.ts    # workflow, attribution, transitions
│   │       │   ├── stock.routes.ts      # pièces, mouvements, seuils d'alerte
│   │       │   └── analytics.routes.ts  # TCO, coût/chantier, MTTR, indispo
│   │       ├── sync/
│   │       │   ├── couch-ingest.worker.ts   # flux _changes CouchDB → PostgreSQL
│   │       │   ├── pg-to-couch.projector.ts # référentiel PostgreSQL → CouchDB (lecture terrain)
│   │       │   └── ticket-state-machine.ts
│   │       └── lib/
│   │           └── cost-imputation.ts   # calcul + imputation analytique par chantier
│   │
│   ├── field-pwa/
│   │   ├── vite.config.ts           # vite-plugin-pwa
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx             # routeur d'écrans : home → scan → ticket
│   │       ├── db/
│   │       │   ├── pouch.ts         # bases locales + réplication live + retry
│   │       │   └── outbox.ts        # file d'attente + statut de synchro par doc
│   │       ├── lib/
│   │       │   └── qr.ts            # parsing payload QR + résolution engin (offline, via PouchDB ref)
│   │       ├── hooks/
│   │       │   ├── useOnlineStatus.ts
│   │       │   ├── useCallbackRef.ts
│   │       │   └── useQrScanner.ts  # caméra + BarcodeDetector natif, repli jsQR
│   │       └── components/
│   │           ├── TicketCreateForm.tsx   # ← composant clé : création rapide + photo + offline
│   │           └── QrScanner.tsx          # ← écran plein cadre : viseur, torche, saisie manuelle
│   │
│   └── admin-web/                   # Next.js — dashboard parc / planning / stocks / analytique
│       └── (app router, pages: /parc, /tickets, /planning, /stocks, /analytique)
│
└── infra/
    └── couchdb/                     # design docs (validate_doc_update, vues)
```

## 3. Cycle de vie d'un ticket (machine à états)

```
CRÉÉ ─▶ EN_ATTENTE ─▶ QUALIFIÉ ─▶ PLANIFIÉ ─▶ EN_COURS ─▶ TRAVAUX_TERMINÉS ─▶ VALIDÉ_TERRAIN ─▶ CLÔTURÉ
                                                                     ▲                              │
  (annulation possible depuis tout état non clôturé) ────────────────┴──── ANNULÉ ◀────────────────┘
```

| Transition | Rôle autorisé | Effet |
|---|---|---|
| `* → EN_ATTENTE` | FIELD_MANAGER (création) | crée le ticket + relevé compteur |
| `EN_ATTENTE → QUALIFIÉ` | PARK_MANAGER | fixe urgence réelle, diagnostic |
| `QUALIFIÉ → PLANIFIÉ` | PARK_MANAGER | attribue mécanicien/prestataire + date |
| `PLANIFIÉ → EN_COURS` | MECHANIC / PARK_MANAGER | démarre l'intervention |
| `EN_COURS → TRAVAUX_TERMINÉS` | MECHANIC | saisit heures MO + pièces consommées |
| `TRAVAUX_TERMINÉS → VALIDÉ_TERRAIN` | FIELD_MANAGER | **signature électronique** obligatoire |
| `VALIDÉ_TERRAIN → CLÔTURÉ` | PARK_MANAGER / ADMIN | fige les coûts, impute au chantier |
