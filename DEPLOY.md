# Mise en ligne — Vercel + Neon

Cible : **Neon** (PostgreSQL managé) · **Vercel** ×3 projets (API serverless, admin web, PWA terrain).
Stockage des photos : **Cloudflare R2** (optionnel, activable après coup).

La synchro terrain se fait par **REST** (`/api/sync/*`) — pas de CouchDB à héberger.
Le temps réel de l'admin passe en **polling** (rafraîchissement auto toutes les 15 s).

---

## 0. Comptes nécessaires

- [GitHub](https://github.com) — héberge le code, Vercel déploie depuis là
- [Neon](https://neon.tech) — base PostgreSQL (offre gratuite suffisante pour démarrer)
- [Vercel](https://vercel.com) — 3 projets (offre Hobby gratuite)
- (optionnel) [Cloudflare R2](https://developers.cloudflare.com/r2/) — pièces jointes

---

## 1. Publier le code sur GitHub

```bash
cd C:\Users\dell\Documents\gmao-btp
git add -A
git commit -m "GMAO — prêt pour déploiement"
gh repo create gmao --private --source=. --push      # ou créer le dépôt à la main puis: git push
```

---

## 2. Base de données — Neon

1. Neon → **New Project** → région la plus proche (ex. *AWS eu-central-1*).
2. Dans **Connection Details**, récupérer **deux** chaînes :
   - **Pooled connection** (l'hôte contient `-pooler`) → ce sera `DATABASE_URL`
   - **Direct connection** (sans `-pooler`) → ce sera `DIRECT_URL`
   - garder `?sslmode=require` à la fin des deux.
3. Appliquer le schéma **depuis ton poste** (une seule fois, puis à chaque évolution du schéma) :

```bash
cd apps/api
# les 2 variables pointent sur la connexion DIRECTE pour les migrations
set DATABASE_URL=postgresql://USER:PWD@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
set DIRECT_URL=%DATABASE_URL%
npx prisma migrate deploy
# (facultatif) jeu de démonstration :
npx tsx prisma/seed.ts
```

> PowerShell : `$env:DATABASE_URL="…"; $env:DIRECT_URL=$env:DATABASE_URL`

---

## 3. API — projet Vercel n°1

Vercel → **Add New… → Project** → importer le dépôt `gmao`.

| Réglage | Valeur |
|---|---|
| **Root Directory** | `apps/api` |
| Framework Preset | *Other* |
| Build / Install / Output | laisser vide (lus depuis `apps/api/vercel.json`) |

**Environment Variables** (cf. [`apps/api/.env.production.example`](apps/api/.env.production.example)) :

| Clé | Valeur |
|---|---|
| `DATABASE_URL` | chaîne **pooled** Neon (`-pooler`, `?sslmode=require`) |
| `DIRECT_URL` | chaîne **directe** Neon |
| `JWT_ACCESS_SECRET` | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | `openssl rand -hex 32` |
| `CORS_ORIGINS` | *(à compléter à l'étape 6)* |
| `DEFAULT_LABOR_RATE` | `12000` |
| `TRAVEL_KM_RATE` | `350` |

Déployer. Noter l'URL, ex. `https://gmao-api.vercel.app`. Test : `GET /health` doit répondre `{"ok":true}`.

---

## 4. Admin web — projet Vercel n°2

Nouveau projet, même dépôt.

| Réglage | Valeur |
|---|---|
| **Root Directory** | `apps/admin-web` |
| Framework Preset | *Next.js* (auto) |

**Environment Variables** :

| Clé | Valeur |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://gmao-api.vercel.app` |

(ne **pas** définir `NEXT_PUBLIC_WS_URL` : l'API Vercel n'a pas de WebSocket, le polling prend le relais.)

Déployer → ex. `https://gmao-admin.vercel.app`.

---

## 5. PWA terrain — projet Vercel n°3

Nouveau projet, même dépôt.

| Réglage | Valeur |
|---|---|
| **Root Directory** | `apps/field-pwa` |
| Framework Preset | *Vite* (auto) |

**Environment Variables** :

| Clé | Valeur |
|---|---|
| `VITE_API_URL` | `https://gmao-api.vercel.app` |

Déployer → ex. `https://gmao-terrain.vercel.app`. HTTPS est fourni : la caméra (scan QR) fonctionne.

---

## 6. Autoriser les fronts sur l'API (CORS)

Projet **gmao-api** → Settings → Environment Variables → `CORS_ORIGINS` :

```
https://gmao-admin.vercel.app,https://gmao-terrain.vercel.app
```

Puis **Redeploy** le projet API.

---

## 7. Première connexion

- Admin : `https://gmao-admin.vercel.app` → `admin@gmao.local` / `gmao1234` (si le seed a été lancé).
- **Changer immédiatement** le mot de passe et créer les vrais comptes via **Équipe & accès**.
- Si le seed n'a pas été lancé, créer un premier `ADMIN` en base :

```sql
-- psql sur Neon, mot de passe = bcrypt("VotreMotDePasse")
INSERT INTO "User"(id,email,"passwordHash","fullName",role,active,"createdAt","updatedAt")
VALUES (gen_random_uuid(),'vous@example.com','$2a$10$....','Votre Nom','ADMIN',true,now(),now());
```

(générer le hash : `node -e "console.log(require('bcryptjs').hashSync('VotreMotDePasse',10))"`)

---

## 8. (Optionnel) Pièces jointes — Cloudflare R2

Sans cette étape, les DI se synchronisent mais les photos ne sont pas conservées côté serveur.

1. Cloudflare → R2 → **Create bucket** `gmao-media`.
2. **Manage R2 API Tokens** → créer un token (Object Read & Write) → noter *Access Key ID*, *Secret Access Key*, *endpoint* `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
3. Projet **gmao-api** → variables :

| Clé | Valeur |
|---|---|
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_BUCKET` | `gmao-media` |
| `S3_ACCESS_KEY` | *Access Key ID* |
| `S3_SECRET_KEY` | *Secret Access Key* |

Redeploy l'API.

---

## 9. Domaines personnalisés (optionnel)

Vercel → chaque projet → Settings → Domains. Après avoir ajouté un domaine à l'admin/PWA,
mettre à jour `CORS_ORIGINS` (API) et `NEXT_PUBLIC_API_URL` / `VITE_API_URL` en conséquence, puis redeploy.

---

## Évolutions du schéma

À chaque modification de `apps/api/prisma/schema.prisma` :

```bash
cd apps/api
$env:DATABASE_URL="<neon-direct>"; $env:DIRECT_URL=$env:DATABASE_URL
npx prisma migrate dev --name <description>      # crée la migration en local
git add prisma/migrations && git commit -m "db: <description>" && git push
$env:DATABASE_URL="<neon-direct>"; npx prisma migrate deploy   # applique en prod
```

Le redeploy Vercel de l'API régénère seul le client Prisma.

---

## Variante temps réel + CouchDB (plus tard)

Pour du vrai temps réel (WebSocket) et de la réplication PouchDB native, héberger l'API + un
worker + CouchDB sur un service *process long* (Render, Railway, VPS) : voir
`apps/api/Dockerfile`, `apps/api/scripts/couch-setup.ts` et `infra/couchdb/`. Il suffit alors de
définir `NEXT_PUBLIC_WS_URL` côté admin pour repasser du polling au WebSocket.
