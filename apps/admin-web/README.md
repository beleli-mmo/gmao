# Admin Web — GMAO BTP (Next.js 14)

Dashboard bureau : gestion du parc, workflow des tickets, planning, stocks et analytique des coûts.
Toutes les données proviennent de l'API REST (`/api/*`, PostgreSQL = source de vérité) ;
les changements de statut arrivent en direct par **WebSocket** (`/ws`).

## Démarrer

```bash
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL
npm install
npm run dev                        # http://localhost:3000
```

Connexion : `parc@gmao.local` / `gmao1234` (responsable parc). Le layout `(app)` refuse
les rôles autres que `PARK_MANAGER` / `ADMIN`.

## Arborescence réelle

```
app/
├── layout.tsx                 # <QueryProvider> + métadonnées
├── page.tsx                   # redirect → /dashboard
├── login/page.tsx             # POST /api/auth/login, tokens en localStorage
└── (app)/
    ├── layout.tsx             # garde de rôle + <Sidebar> + useRealtime() (WebSocket)
    ├── dashboard/page.tsx     # KPIs (tickets ouverts, N1, indispo parc, pièces sous seuil, coût mois)
    ├── tickets/page.tsx       # file filtrable (statut, urgence)
    ├── tickets/[id]/page.tsx  # détail : contexte, workflow, coûts imputés, interventions, historique
    ├── parc/page.tsx          # liste + changement de statut inline
    ├── planning/page.tsx      # interventions planifiées groupées par jour (14 j)
    ├── stocks/page.tsx        # pièces, seuils de réappro
    └── analytique/page.tsx    # coût/chantier (graphe), TCO/engin, MTTR + indisponibilité

components/
├── Sidebar.tsx
├── StatusBadge.tsx            # badges d'état RÉSERVÉS (statut ≠ série), toujours avec libellé
├── KpiCard.tsx                # tuile headline (pas de graphe → pas de hover)
├── CostBreakdownChart.tsx     # Recharts — barres empilées, palette catégorielle Okabe–Ito (ordre fixe), légende + tooltip
└── TicketWorkflowBar.tsx      # n'affiche que les transitions permises (statut × rôle), miroir de la state-machine

lib/
├── api.ts                     # fetch typé + Bearer token + endpoints
├── auth.ts                    # login / logout / session
├── ws.ts                      # useRealtime() → invalidation TanStack Query
└── format.ts                  # XOF, dates, libellés FR, palette coûts

providers/QueryProvider.tsx    # TanStack Query
```

## Alimentation depuis le bureau (saisie manuelle)

Le dashboard lit PostgreSQL ; il est alimenté par deux chemins d'écriture — le terrain
(PWA → CouchDB → worker d'ingestion) et le **bureau via REST**. Écrans de saisie :

| Écran | Action | Endpoint |
|---|---|---|
| `/tickets/new` | créer une demande (panne / préventif / pièce) reçue par téléphone-radio | `POST /api/tickets` → passe en `EN_ATTENTE` via la machine à états |
| `/chantiers` | créer un chantier (code analytique) | `POST /api/sites` |
| `/planning` | planifier un ticket qualifié (mécano/prestataire + date) ; replanifier / réaffecter une intervention ; filtre par mécanicien | `POST /api/tickets/:id/plan`, `PATCH /api/interventions/:id`, `GET /api/providers` |
| `/parc` | ajouter un engin (QR `GMAO:<assetTag>` généré) | `POST /api/equipment` |
| `/stocks` | créer une pièce + stock initial ; réception (CUMP recalculé) | `POST /api/stock/parts`, `POST /api/stock/parts/:id/receive` |
| `/tickets/[id]` | qualifier → planifier → démarrer → CR → réception → clôturer ; ajouter une facture externe | `POST /api/tickets/:id/{qualify,plan,start,work-done,validate,close,external-invoice}` |
| `/lots` | référentiel des lots techniques (ASC, SSI, PLB, ELC, GE, ARC, NET) + création | `GET/POST /api/lots` |
| `/parc/[id]` | carnet de santé d'un actif : identification, plan préventif, historiques préventif/curatif, coût de possession cumulé | `GET /api/equipment/:id` |
| `/equipe` | créer un compte, changer le rôle, activer/désactiver, réinitialiser le mot de passe | `GET/POST /api/users`, `PATCH /api/users/:id` |

**Analytique** (`/analytique`) : coût par **lot technique** (`GET /api/analytics/cost-by-lot`),
**TRPP** global et par lot (`GET /api/analytics/trpp`), coût par projet, TCO par actif, MTTR.
Le tableau de bord affiche le **TRPP annuel** (cible > 95 %) et le nombre de préventifs en retard.

**Vocabulaire** (procédure) : DI (demande d'intervention), OS/BT (ordre de service), priorités
P1/P2/P3, lots techniques, carnet de santé. Le workflow interne (`EN_ATTENTE → … → CLOTURE`) est
inchangé, seuls les libellés sont adaptés.

**Rôles** : `FIELD_MANAGER` (chef de chantier), `PARK_MANAGER` (responsable parc), `MECHANIC`, `ADMIN`.
Création/modification de comptes réservée à `PARK_MANAGER` + `ADMIN` ; seul un `ADMIN` peut créer
ou promouvoir un `ADMIN` ; on ne peut ni changer son propre rôle ni se désactiver soi-même.

Les `CostLine` (imputation analytique) sont générées automatiquement à `TRAVAUX_TERMINÉS`
et figées à `CLÔTURÉ` — aucune ressaisie de coût.

## Endpoints API consommés (ajoutés au backend)

- `GET /api/analytics/overview` — agrégat KPI du dashboard
- `GET /api/interventions?scheduled=1&horizonDays=14` — planning
- `GET/POST /api/sites`, `GET /api/users?role=`, `POST /api/tickets`, `POST /api/stock/parts`,
  `POST /api/tickets/:id/external-invoice`

Le reste utilise les routes déjà présentes : `/api/tickets*`, `/api/equipment*`, `/api/stock/parts`,
`/api/analytics/{cost-by-site,tco,reliability}`.

## Choix data-viz

`CostBreakdownChart` suit la méthode : forme choisie selon le job (magnitude comparée entre chantiers →
barres empilées horizontales), **couleur = identité catégorielle** en ordre fixe (palette Okabe–Ito,
sûre pour tous les daltonismes), légende toujours présente, axes récessifs, tooltip par segment,
séparateur 2 px entre segments, coins arrondis 4 px sur le segment terminal. Les couleurs de **statut**
(parc, ticket) sont un jeu distinct et réservé, jamais réutilisé comme couleur de série, et toujours
doublé d'un libellé.
