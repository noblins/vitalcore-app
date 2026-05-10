# VitalCore — Audit complet (fonctionnel, back-office, infra)

**Date** : 2026-05-10
**Auditeur** : Claude Opus 4.7 (1M context)
**Périmètre** : application PWA Vite+React+TS + backend Supabase (auth, Postgres, Storage, Edge Functions Deno) + déploiement Vercel
**Méthode** : lecture intégrale du code source (~7000 LoC), analyse statique des Edge Functions, interrogation directe de l'infra Supabase via MCP, vérification des secrets, croisement des configs prod vs repo.

> ⚠️ Le projet Supabase `mnzvexnaemdetznxeeuo` est en état **INACTIVE** (paused). Les requêtes DDL (`list_tables`, `list_migrations`, `list_extensions`) timeout. L'audit a donc été fait sur le code et les métadonnées Edge Functions, qui restent disponibles.

---

## Verdict synthétique

| Dimension | Score | Constat |
|---|---|---|
| **Sécurité backend** | 🔴 **2/10** | PAT exposé sur disque ; 9 fonctions de debug actives en prod sans JWT ; `verify_jwt:false` sur la quasi-totalité ; tables legacy `deploy_b64` / `html_chunks` orphelines ; `subscriptions` historiquement sans RLS ; mots de passe de comptes test hardcodés. |
| **Sécurité front** | 🟠 **4/10** | `callEdge` envoie l'anon key à la place du JWT ; `price_id` Stripe contrôlé client ; pas de CSP/HSTS ; bucket `photos` public (biométrie). |
| **Architecture / qualité code** | 🟠 **5/10** | 1 mega-hook `useDashboardData` (12 requêtes au mount) ; aucune lib de cache ; toasts/erreurs réinventés écran par écran ; magic numbers + duplication ; `selData!`/`as any` ; `Spinner` cassé en prod (Tailwind purge). |
| **UX / fonctionnel** | 🟠 **5/10** | Plusieurs flows bloquants (écran blanc si profile load fail, retour cassé sur Hydration, race conditions sur addWater, double-submit non protégé). Modals sans Escape ni focus trap. Aucun "mot de passe oublié", "delete account", "edit meal". |
| **Tests** | 🟡 **6/10** | 6 fichiers, ~1000 LoC de tests utils, mais inline (divergent du code de prod), aucun test UI, aucun test des Edge Functions. |
| **Infra / DevOps** | 🟠 **4/10** | Pas de `.env`, secrets hardcodés ; pas d'ESLint/Prettier ; pas de pre-commit ; pas de CI ; `index.html.backup` (65 KB) tracké ; manifest PWA sans PNG ; Service Worker n'inclut ni storage ni edge functions. |
| **Conformité RGPD** | 🔴 **2/10** | App santé (GLP-1, biométrie, photos avant/après) sans consentement explicite art. 9, sans droit à l'effacement, photos en bucket public, logs de chat persistés sans TTL. |

---

## Table des matières

1. [Findings critiques (P0) — action immédiate](#1-findings-critiques-p0--action-immédiate)
2. [Sécurité — backend & Edge Functions](#2-sécurité--backend--edge-functions)
3. [Sécurité — frontend](#3-sécurité--frontend)
4. [Sécurité — données & RGPD](#4-sécurité--données--rgpd)
5. [Audit fonctionnel par écran](#5-audit-fonctionnel-par-écran)
6. [Architecture & qualité de code](#6-architecture--qualité-de-code)
7. [Performance](#7-performance)
8. [Tests](#8-tests)
9. [Infra, build, déploiement, PWA](#9-infra-build-déploiement-pwa)
10. [Plan de remédiation priorisé](#10-plan-de-remédiation-priorisé)

---

## 1. Findings critiques (P0) — action immédiate

### 🚨 1.1 — PAT Supabase en clair dans `.mcp.json`
- **Fichier** : `/Users/mathiasnoblinski/Desktop/vitalcore-app/.mcp.json`
- **Contenu** : un PAT Supabase (préfixe `sbp_e041…`) est stocké en clair dans la query string de l'URL MCP, accompagné du `project_ref` cible.
- **Risque** : ce token donne **un accès admin à TOUTE l'organisation Supabase** (3 projets : `vitalcore`, `Munjaro`, `QuartierFit`). Il permet : créer/supprimer des tables, lire toutes les données, déployer des Edge Functions, accéder aux clés service role.
- **Statut Git** : `.mcp.json` est dans `.gitignore` (ligne 11) — non committé. ✅ Bon réflexe historique.
- **Mais** : présent sur disque, dans la conversation tool calls, et potentiellement dans les backups système. À considérer comme **compromis**.
- **Remédiation immédiate** :
  1. Aller sur https://supabase.com/dashboard/account/tokens et **révoquer** ce PAT.
  2. En émettre un nouveau, le stocker via un password manager ou la variable d'env système (`SUPABASE_ACCESS_TOKEN`).
  3. Ne plus jamais commiter ni stocker en clair dans un fichier de projet.

### 🚨 1.2 — 9 Edge Functions de debug actives en production sans JWT
Liste extraite via MCP — toutes ont `status: ACTIVE`, `verify_jwt: false` et sont appelables par n'importe qui :

| Fonction | Probable usage | Risque |
|---|---|---|
| `admin` | endpoint admin maison | 🔴 critique — peut potentiellement exécuter des opérations privilégiées |
| `app` | serveur HTML inline | 🟠 mineur si juste statique |
| `github-push`, `github-push-v3`, `github-push-file` | push code vers GitHub | 🔴 si token GitHub stocké en env de la fonction → prise de contrôle du repo |
| `fix-and-push` | idem | 🔴 idem |
| `push-b64-to-github` | idem | 🔴 idem (a `verify_jwt: true`, mais expose toujours l'API au public) |
| `serve-app`, `serve-test`, `test-html`, `test-ping`, `test-ct` | endpoints de test | 🟠 |
| `upload-site`, `deploy-site`, `deploy-to-storage`, `store-chunk` | déploiement HTML chunké en BDD | 🟠 (les tables `deploy_b64` et `html_chunks` qu'elles écrivent sont d'ailleurs lockées dans `db-hardening.sql`) |

**22 Edge Functions déployées vs 4 dans le repo** (`chat`, `analyze-meal-photo`, `suggest-meals`, manque `analyze-ecart` et `create-checkout` côté code, pourtant déployées). Drift complet entre source et prod.

**Remédiation** :
```bash
supabase functions delete admin app github-push github-push-v3 github-push-file \
  fix-and-push push-b64-to-github serve-app serve-test test-html test-ping test-ct \
  upload-site deploy-site deploy-to-storage store-chunk \
  --project-ref mnzvexnaemdetznxeeuo
```
Et committer le code source des fonctions restantes (`analyze-ecart`, `create-checkout`, `stripe-webhook`) qui n'est pas dans le repo.

### 🚨 1.3 — `verify_jwt: false` sur les fonctions IA principales
- **`chat`** : `verify_jwt: false` mais le code lit `Authorization: Bearer <token>` et appelle `sb.auth.getUser(token)`. ✅ Sécurité applicative présente — OK fonctionnellement, mais désactiver `verify_jwt` Supabase, c'est se priver d'une couche de défense en profondeur.
- **`suggest-meals`** : `verify_jwt: false` ET aucune validation JWT côté code. **Anonyme**. Un attaquant peut forger des requêtes en boucle pour brûler la facture Anthropic.
- **`analyze-ecart`** : non auditable côté code (absent du repo) mais `verify_jwt: false` côté config. Probablement même problème.
- **Remédiation** :
  1. Activer `verify_jwt: true` partout côté Supabase config.
  2. Ajouter une validation JWT explicite dans `suggest-meals`.
  3. Rate limit par user_id (pas seulement par jour pour `chat`).

### 🚨 1.4 — Identifiants de test commités dans le repo
- `src/__tests__/supabase-integration.test.ts:14-19` :
  ```ts
  const SUPABASE_URL  = 'https://mnzvexnaemdetznxeeuo.supabase.co'
  const SUPABASE_ANON = 'eyJhbGciOi...'
  const TEST_EMAIL    = 'admin@vitalcore.app'
  const TEST_PASSWORD = 'Admin1234!'
  ```
- `scripts/create-test-accounts.mjs` (heureusement gitignoré) crée un compte `admin@vitalcore.app / Admin1234!` avec **`subscription_plan: 'premium'`** et `onboarding_completed: true`.
- **Risque** : qui clone le repo + run les tests → un compte premium pleinement opérationnel sur la prod.
- **Remédiation** :
  1. Changer le mot de passe de `admin@vitalcore.app` immédiatement.
  2. Déplacer les credentials dans `.env.test` non-tracké.
  3. Mieux : créer un projet Supabase **staging** distinct pour les tests d'intégration.

### 🚨 1.5 — `OnboardedRoute` retourne `null` → écran blanc
- `src/App.tsx:21-26` :
  ```tsx
  function OnboardedRoute(...) {
    if (loading || (user && !profile)) return null
    ...
  }
  ```
- Si `fetchProfile` échoue ou prend > 4s, et que SplashScreen redirige vers `/dashboard`, `OnboardedRoute` retourne `null` → **écran totalement blanc**, sans loader ni erreur.
- **Reproductible** : connexion OK + Supabase REST timeout/down sur `profiles` → utilisateur bloqué sans pouvoir rien faire.
- **Remédiation** : afficher un loader + bouton "Réessayer" + propager une erreur depuis `AuthContext`.

### 🚨 1.6 — `callEdge` envoie l'anon key au lieu du JWT user
- `src/lib/supabase.ts:19-29` :
  ```ts
  export async function callEdge(path: string, body: unknown): Promise<Response> {
    return fetch(`${EDGE_URL}/${path}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,  // ← anon, pas user
      },
      ...
    })
  }
  ```
- **Conséquence** : `EcartScreen`, `SuggestionsScreen`, `MealSuggestModal` n'envoient pas le JWT utilisateur → l'Edge Function ne peut pas faire de RLS user-scoped, ni rate-limit par user, ni gate Premium.
- **Remédiation** : ajouter une option `auth: 'user' | 'anon'` à `callEdge`, et utiliser `getFreshToken()` par défaut.

### 🚨 1.7 — Profil utilisateur potentiellement modifiable côté client (à vérifier)
- `src/contexts/AuthContext.tsx:106-111` insère la ligne `profiles` directement depuis le client après signup, en passant `subscription_plan: 'free'`.
- Si la RLS UPDATE sur `profiles` est trop permissive (`USING (auth.uid() = id)` sans `WITH CHECK` qui exclut `subscription_plan`), un user peut faire :
  ```ts
  await sb.from('profiles').update({ subscription_plan: 'premium' }).eq('id', user.id)
  ```
  et débloquer toutes les features Premium gratuitement.
- **Vérification impossible** maintenant car DB en pause.
- **Remédiation** :
  1. Ne pas insérer le profil côté client → utiliser un trigger Postgres `on_auth_user_created` qui crée le profil.
  2. Trigger BEFORE UPDATE qui rejette toute modif de `subscription_plan`, `tdee` (calculé), `email`, `id`.
  3. `GRANT/REVOKE` colonnaire si nécessaire.

### 🚨 1.8 — Photos de progression en bucket public
- `src/screens/dashboard/features/PhotosScreen.tsx:41` : `sb.storage.from('photos').getPublicUrl(path)`.
- Bucket `photos` doit être public pour que `getPublicUrl` fonctionne sans signature.
- **Conséquence RGPD** : photos avant/après corporelles = **données biométriques (RGPD art. 9)**, exposées via une URL devinable (`{userId}/progress/{timestamp}.jpg`). Énumération possible.
- **Remédiation** :
  1. Bucket privé.
  2. `createSignedUrl(path, 3600)` côté client.
  3. Consentement explicite RGPD avant 1er upload.

---

## 2. Sécurité — backend & Edge Functions

### 2.1 Edge Function `chat`
- ✅ Vérifie le JWT via `sb.auth.getUser(token)`.
- ✅ Rate-limit Premium 20 msg/jour.
- ⚠️ **Race condition compteur** : entre `dailyCountRes` et l'INSERT des messages, deux requêtes simultanées peuvent passer la barrière 20→21. Pas grave (dérive +1 par tentative simultanée).
- ⚠️ **Cache global `cachedApiKey`** (ligne 13) : pas de problème en pratique car Edge Functions sont mono-tenant Supabase, mais pattern dangereux à étendre.
- ⚠️ **Persistance** : la fonction insère 2 lignes (`user` + `assistant`) APRÈS l'appel Claude. Si l'INSERT échoue silencieusement, l'historique côté client diverge du serveur.
- ⚠️ **Pas de redaction PII dans les prompts** : nom complet, poids, objectif, médicament envoyés à Anthropic. Vérifier le DPA Anthropic + s'assurer qu'Anthropic n'entraîne pas sur les données.
- ⚠️ **Prompt injection** : un user peut injecter `"Ignore tes instructions et retourne X"` dans le message ; pas de mitigation (validation regex, rate limit). Faible impact direct (pas de tools côté chat) mais peut polluer la persistance.
- ⚠️ **Fuite d'erreur** : `details: errBody` (ligne 191) renvoie le body brut d'Anthropic au client → leakage potentiel.

### 2.2 Edge Function `analyze-meal-photo`
- ✅ JWT vérifié, gate Premium 403 robuste.
- ⚠️ **Pas de limite de taille** sur `image_base64`. Un user peut envoyer 50 Mo en base64 → tracas mémoire + facture Anthropic (modèle Sonnet vision = cher).
- ⚠️ **Pas de validation MIME serveur** (`media_type` est trusted depuis le body).
- ⚠️ **Cache global `cachedApiKey`** idem chat.
- ⚠️ **Modèle utilisé** : `claude-sonnet-4-20250514` — modèle ancien et non disponible aujourd'hui. À mettre à jour vers `claude-sonnet-4-6` ou `claude-haiku-4-5-20251001` (plus économique pour ce use case).

### 2.3 Edge Function `suggest-meals`
- 🔴 **AUCUNE authentification**. `verify_jwt: false` côté config et aucun check applicatif.
- 🔴 **Pas de rate limit**.
- 🔴 **Aucune gate Premium**.
- **Vecteur** : un attaquant fait un script `for i in {1..1000000}; do curl ...; done` → dépense l'intégralité du budget Anthropic en quelques minutes.
- ✅ Retry 3x avec backoff sur 529 (overload). Bon réflexe.

### 2.4 Edge Function `analyze-ecart`
- Code absent du repo, mais déployée (version 1, créée 2026-04-15). Statut `verify_jwt: false`.
- **Sans audit code, on assume les mêmes problèmes que `suggest-meals`** : anonyme + pas de rate limit + pas de gate Premium.

### 2.5 Edge Function `create-checkout`
- Code absent du repo, mais `verify_jwt: true` (configuré). ✅ Bon point.
- ⚠️ Le client envoie `price_id: 'price_premium'` (`PremiumModal.tsx:23`) — le serveur doit **ignorer** cette valeur et utiliser un mapping côté serveur, sinon un user peut envoyer le price_id d'un produit gratuit.

### 2.6 Edge Function `stripe-webhook`
- Déployée mais code absent du repo. **Critique** : le webhook DOIT vérifier la signature Stripe (`stripe.webhooks.constructEvent(body, signature, secret)`), sinon n'importe qui peut forger un événement `checkout.session.completed` et activer Premium gratuitement.
- À auditer impérativement le code en prod.

### 2.7 RLS Postgres (status)
- Le script `scripts/db-hardening.sql` (15 avr 2026) a corrigé plusieurs problèmes critiques :
  - ✅ `body_measurements` créée avec RLS.
  - ✅ `weight_logs` UNIQUE constraint + dédup.
  - ✅ **`subscriptions` n'avait PAS de RLS** historiquement → activé dans le script. **Si le script n'a pas été appliqué en prod, c'est un trou béant : un user pouvait lire toutes les abonnements.**
  - ✅ Tables legacy `deploy_b64`, `html_chunks` lockées (deny all).
  - ✅ Index ajoutés sur les colonnes de filtre fréquentes.
  - ✅ CHECK constraints (poids 0-1000kg, eau 0-50000ml, calories 0-20000, fasting 1-72h).
- ⚠️ Le script n'inclut pas :
  - Trigger d'auto-création du `profiles` row.
  - Restriction de modification de `profiles.subscription_plan` (cf. 1.7).
  - RLS sur `app_config` (à vérifier — doit être DENY ALL pour anon/authenticated).
  - RLS sur `chat_messages` (à vérifier).
  - Storage bucket `photos` policies.
- **Action** : confirmer que `db-hardening.sql` a bien été exécuté en prod (la DB en pause empêche la vérif via MCP).

### 2.8 CORS
- Toutes les Edge Functions : `Access-Control-Allow-Origin: '*'`.
- ✅ Acceptable pour PWA.
- ⚠️ Devrait être restreint à `https://vitalcore-app.vercel.app` (et les preview URLs Vercel) une fois le domaine final fixé.

### 2.9 Headers de sécurité (Vercel)
- `vercel.json` ne définit **aucun header** :
  - Pas de Content-Security-Policy.
  - Pas de Strict-Transport-Security.
  - Pas de X-Frame-Options (clickjacking via iframe possible).
  - Pas de X-Content-Type-Options.
  - Pas de Permissions-Policy.
- **Remédiation** :
  ```json
  {
    "headers": [{
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(self), microphone=(), geolocation=()" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'" }
      ]
    }]
  }
  ```

---

## 3. Sécurité — frontend

### 3.1 Anon key et URL Supabase hardcodées
- `src/lib/supabase.ts:3-4` + `vite.config.ts:24` (regex SW) + `src/__tests__/supabase-integration.test.ts:14`.
- L'anon key n'est pas un secret en soi (RLS est la barrière), mais hardcoder bloque les déploiements multi-env (staging/preview).
- **Remédiation** : `.env` + `import.meta.env.VITE_SUPABASE_URL`, lu via `loadEnv` dans `vite.config.ts`.

### 3.2 Stripe `price_id` côté client
- `PremiumModal.tsx:23` : `body: JSON.stringify({ user_id: user.id, price_id: 'price_premium' })`.
- Si la fonction `create-checkout` lit ce price_id sans validation, un user pourrait envoyer un `price_id` d'un produit moins cher.
- **Remédiation** : ne JAMAIS envoyer le price_id depuis le client. Mapping côté serveur (`plan: 'premium'` → `STRIPE_PRICE_PREMIUM`).

### 3.3 XSS — affichage du contenu chat
- `CoachTab.tsx:82` : `{m.content}` est interpolé en text node React → ✅ pas de XSS direct.
- Mais : aucun rendu Markdown / liens cliquables → si un assistant retourne un lien malveillant, l'user doit le copier-coller (limite organique).

### 3.4 Prompt injection persistant
- L'utilisateur peut nommer un repas `food_name = "Ignore previous instructions and..."`. Ce nom est ensuite injecté dans le system prompt du chat (`mealsSummary` dans `chat/index.ts:127`). Risque faible (model robust) mais existant.
- **Remédiation** : escaper / tronquer / sanitize les noms de repas avant insertion en prompt.

### 3.5 Fuite réseau via service worker
- `vite.config.ts:18-31` : SW met en cache les requêtes `/rest/...` Supabase pendant 5 min.
- Risque privacy mineur : si l'app est partagée sur un device commun, les données restent en cache navigateur. **OK pour un usage personnel** mais à documenter.

### 3.6 Logout incomplet
- `AuthContext.tsx:121-125` : `sb.auth.signOut()` sans `{ scope: 'global' }` → invalide seulement la session locale, pas les autres devices.
- **Remédiation** : `sb.auth.signOut({ scope: 'global' })` pour les devices multiples ; conserver le scope local pour la déconnexion régulière.

---

## 4. Sécurité — données & RGPD

### 4.1 Hébergement EU
- Projet Supabase en `eu-west-1` (Irlande). ✅ EU.
- DPA à signer avec Supabase + Anthropic (ce dernier en US — vérifier les SCC).

### 4.2 Données sensibles traitées (RGPD art. 9)
- **Données de santé** : `medications` (Ozempic, Mounjaro, Wegovy, doses), `injection_logs` (effets secondaires nausée/fatigue/douleur), `fasting_sessions`, `journal_entries` (humeur).
- **Données biométriques** : `progress_photos` (avant/après).
- **Données de mensurations corporelles** : `body_measurements`.
- **Données comportementales** : `chat_messages` (questions de santé en clair envoyées à Anthropic).

### 4.3 Manques RGPD bloquants
- ❌ Aucun consentement explicite à la collecte de données de santé (CGU + politique de confidentialité absentes du code).
- ❌ Aucun bouton "supprimer mon compte" (`ProfileTab.tsx` n'en a pas).
- ❌ Aucun export des données utilisateur (droit à la portabilité).
- ❌ Aucun TTL sur `chat_messages` (conservation indéfinie).
- ❌ Pas de pseudonymisation / chiffrement applicatif sur `medication_name`, `dose_current`.
- ❌ Pas de registre des traitements (art. 30).
- ❌ Pas de DPO désigné (probablement nécessaire pour app de santé > 250 users).
- ❌ Photos en bucket public (cf. 1.8).
- ❌ `chat_messages.content` envoyé à Anthropic (US) sans clause SCC documentée.

### 4.4 Mentions légales et CGU
- Le code n'expose aucune route `/cgu`, `/privacy`, `/legal`. Aucun lien dans `WelcomeScreen` ou `ProfileTab`.
- **Remédiation** : créer `/legal/terms`, `/legal/privacy` ; checkbox de consentement à l'inscription ; bandeau cookie minimal (la PWA n'utilise pas de cookies tiers, mais localStorage = à mentionner).

---

## 5. Audit fonctionnel par écran

### 5.1 Splash & Auth
- 🔴 `src/App.tsx:23` — `OnboardedRoute` retourne `null` → écran blanc (cf. 1.5).
- 🟠 `src/screens/SplashScreen.tsx:21` — fallback 4s redirige vers `/dashboard` même si profile n'est jamais arrivé.
- 🟠 `src/screens/auth/LoginScreen.tsx:36` — Enter ne marche que dans le champ password, pas email.
- 🟠 `src/screens/auth/SignupScreen.tsx` — pas de confirmation password, pas d'indicateur de force.
- 🟠 `src/contexts/AuthContext.tsx:106-111` — INSERT profile sans check d'erreur, sans `upsert`, sans gestion des concurrent inserts.
- 🟠 `AuthContext.tsx:95` — `emailRedirectTo: 'https://vitalcore-app.vercel.app'` hardcodé → casse en local et staging.

### 5.2 Onboarding
- 🟠 Aucune validation par étape : on peut valider Step 1 sans choisir genre, Step 2 sans date.
- 🟠 `OnboardingScreen.tsx:106` — `target_weight_kg = poids actuel` si vide, peu importe l'objectif (incohérent avec `lose`/`gain`).
- 🟠 `:113-123` — INSERT medication sans check d'erreur.
- 🟠 Pas de demande de `full_name` → tous les utilisateurs apparaissent comme "Utilisateur" (`ProfileTab.tsx:46`) et "Bonjour Ami" (`HomeTab.tsx:136`).
- 🟢 `calcAge` validation 10-110 ✅, poids 20-500 ✅, taille 100-250 ✅.

### 5.3 HomeTab
- 🔴 `src/screens/dashboard/tabs/HomeTab.tsx:97-108` `addWater` — race condition (lecture + écriture non atomiques). Double clic = perte d'incrément.
- 🟠 `:67-69` `weightPct` — si `startWeight === currentWeight`, retourne 100% prématurément.
- 🟠 `:301-307` "Réinitialiser" eau sans confirmation.
- 🟠 `:91-93` `daysUntilInj` peut afficher `J-(-3)` si data corrompue.

### 5.4 NutritionTab
- 🟠 `:91-110` `saveAll` — pas de validation macros négatives ou absurdes (99999 kcal accepté).
- 🟠 `:95-105` insert sans check d'erreur → "X aliments ajoutés ✓" mensonger en cas d'échec.
- 🟠 `:113-116` `deleteMeal` — pas de confirmation, pas d'optimistic update.
- 🟠 `:140-143` switch de section meal pendant édition → perte des rows.
- 🟠 `:411-454` champs sans `min`/`max`/`maxLength` → DOS DB possible.
- 🟢 Scan IA : resize image 1024px, base64, gestion d'erreurs OK ✅.

### 5.5 CalendarTab
- 🟠 `:33-41` useEffect lance 1 requête meal par sélection de jour (N+1).
- 🟠 `:63-74` `addWaterForDay` même race que HomeTab.
- 🟠 `:309` formulaire "enregistrer poids" inaccessible si poids déjà saisi (pas d'édition possible).
- 🟠 `:43` `today = new Date().toISOString().slice(0,10)` UTC au lieu de `todayISO()` → décalage 1 jour à 23h+.

### 5.6 CoachTab
- 🔴 `:113-118` Enter envoie pendant que l'IA répond → 5 messages enchaînés possibles (pollue contexte + brûle quota).
- 🟠 `:62` `h-screen max-h-screen` mauvais sur iOS Safari (clavier overlap). Use `100dvh`.
- 🟠 `:108-119` input sans `aria-label`, messages sans `aria-live`.
- 🟠 Aucun bouton "nouveau chat" / "effacer historique".
- 🟢 Timeout 30s, gestion d'erreurs token expiré ✅.

### 5.7 ProfileTab
- 🟠 `:46` "Utilisateur" générique faute de `full_name` à l'onboarding.
- 🟠 `:115` "cliquez pour des idées" sans affordance visuelle (pas d'underline).
- 🟢 Bonne structure ; le plan nutritionnel est clair.

### 5.8 FastingScreen
- 🟠 `:68-75` setInterval 1s → re-render par seconde (battery hit mobile). Passer à 5s ou conditional.
- 🟠 `:77-88` `start()` pas de check `loading` → double-click = 2 sessions.
- 🟠 `:90-98` `stop()` pas de confirmation → perte de 16h de jeûne au tap accidentel.
- 🟠 `:117-126` `streak` compte les jours où une session a démarré (peu importe complétion) → faux "streak".
- 🟢 Phases physiologiques + recommandation auto + protocoles compatibilité = très bon UX.

### 5.9 PhotosScreen
- 🔴 `:41` bucket public → leak biométrie (cf. 1.8).
- 🟠 `:21-55` upload sans resize (4K iPhone = 5 Mo dump direct).
- 🟠 Pas de delete photo après upload.
- 🟠 Pas de `loading="lazy"` sur les `<img>`.
- 🟠 Avant/Après broken si 2 photos prises le même jour.

### 5.10 GLP1Screen
- 🟠 `:53-55` `daysAgo` parse UTC → décalage 1 jour.
- 🟠 `:259-272` `setupMed` pas de check d'erreur.
- 🟠 `:303-308` `stopMed` pas de confirmation.
- 🟠 `:241-256` `firstAtDose` faux si l'user revient à une dose précédente après l'avoir augmentée → "weeksAtDose" gonflé.
- 🟠 `:198-204` `injDose` initialisé une seule fois → reste vide si médicament créé pendant le rendu.
- 🟠 `:43-51` `nextInjDate` ne tient pas compte de l'heure (logging à 23h45 le jour J = programme jour J+7 au lieu de J+1).
- 🟢 Body map sites + titration auto + side effects 0-5 = excellent UX médical.

### 5.11 WeightScreen
- 🟠 `:152` "Poids invalide" affiché en `<Alert type="success">` → message d'erreur en VERT.
- 🟠 `:121-128` `progressPct = NaN` si `weightLogs.length === 0`.
- 🟠 `:255-260` placeholder `${currentWeight || '75'} kg` invite à taper "75 kg" → parseFloat OK mais confusing.
- 🟠 Mensurations : on ne peut pas éditer une fiche existante (uniquement créer une nouvelle date).

### 5.12 SuggestionsScreen
- 🟠 `:104` `useEffect(() => fetchFor('lunch'), [])` ignore `targets` → si profile arrive après mount, fetch initial échoue silencieusement.
- 🟠 `:171` `catch { /* silent */ }` sur dislike.
- 🟠 `:176-191` `handleAdd` insert sans check d'erreur.
- 🟠 Préférences en localStorage (pas de sync multi-device).

### 5.13 EcartScreen
- 🟠 `:114-120` textarea sans `maxLength` (10000 chars accepté → coût IA).
- 🟠 Pas de validation min length.
- 🟠 Résultat éphémère (pas persisté en BDD).

### 5.14 HydrationScreen
- 🔴 `:93` `<button onClick={() => navigate('/')}>` retour cassé (va sur Splash au lieu de /dashboard).
- 🟠 `:37-50` race condition addWater.
- 🟠 `:52-57` resetToday sans confirmation.
- 🟠 `:68-74` `addCustom` pas de cap maximum (99999 ml).
- 🟠 Objectif personnalisé en localStorage → divergent de HomeTab/CalendarTab qui utilisent `weight*35`.

### 5.15 Modals (Journal, Premium, Payment, MealSuggest)
- 🟠 Aucun ne ferme par Escape.
- 🟠 Aucun focus trap.
- 🟠 Aucun `role="dialog"`, `aria-modal`, `aria-labelledby`.
- 🟠 `JournalModal.tsx:24` énergie systématiquement = mood (UI identique).
- 🟠 `PremiumModal.tsx:17-27` upgrade sans loading state ni gestion d'erreur.

### 5.16 BottomNav
- 🟠 Pas d'`aria-current="page"` sur l'onglet actif.
- 🟠 Pas d'`aria-label`.
- 🟠 `startsWith` sur path → matchera `/dashboard/calendar-archive` si jamais ajouté.

### 5.17 Composants UI
- 🔴 `src/components/ui/Card.tsx:43` `Spinner({ size = 8 })` utilise `w-${size}` → **classe dynamique non détectée par Tailwind purge** → spinner invisible en prod (sauf si la classe `w-8 h-8` est utilisée statiquement ailleurs). Bug visuel certain.
- 🟠 `Button.tsx:30` `type="button"` hardcodé → impossible de faire des `<form>` natifs ; chaque écran réinvente `onKeyDown=Enter`.

### 5.18 Manques fonctionnels globaux
- ❌ Pas de "Mot de passe oublié".
- ❌ Pas de "Confirmer email" UI.
- ❌ Pas de "Supprimer mon compte" (RGPD).
- ❌ Pas d'export de données (RGPD).
- ❌ Pas de mode dark.
- ❌ Pas de pull-to-refresh.
- ❌ Pas de undo après delete (meal, photo, injection).
- ❌ Pas d'édition d'un repas / d'une injection / d'une mensuration existante.
- ❌ Pas de notifications push (PWA peut, mais pas implémenté).
- ❌ Pas d'écran offline / banner "vous êtes hors ligne".

---

## 6. Architecture & qualité de code

### 6.1 Anti-patterns React
- **`useDashboardData` mega-hook** : 12 useState + reload qui re-fetch tout. Tous les onglets reçoivent `data` en prop → re-render global à chaque mutation. **À remplacer par Tanstack Query** (1 hook par feature, cache invalidation ciblée, optimistic updates natifs).
- **`selData!` × 12** dans `CalendarTab.tsx:190-264` → assertion non-null dangereuse.
- **`setMessages` après unmount** dans `CoachTab.send()` après await 30s → memory leak React 18 warning.
- **`useEffect` avec `eslint-disable-line`** dans 3 fichiers alors qu'ESLint n'est PAS installé. Cosmétique trompeur.
- **Magic numbers partout** : `35` ml/kg (3 fichiers), `0.27` fat ratio, `1.2/1.375/1.55/1.725/1.9` activity, `2.0/1.8/1.6` proteinPerKg, `500/300/1200` calories, `0.25/0.35/0.10/0.30` meal split (4 fichiers), `86400000`/`3_600_000` ms (15+ occurrences).
- **Strings dupliquées** : `DAYS_FR` (versions courte/longue ambiguës), `WATER_AMOUNTS` (3 versions divergentes), `MEAL_TYPES` (3 versions divergentes), `PREFS_KEY` (2 implémentations).

### 6.2 TypeScript
- `tsconfig.json` relâché : `noUnusedLocals: false`, `noUnusedParameters: false`, pas de `noUncheckedIndexedAccess`, pas de `exactOptionalPropertyTypes`.
- `ChatMessage` incomplet (manque `id`, `created_at`) → `key={i}` au lieu de `key={m.id}`.
- `Profile.gender / activity_level / diet` typés `string` au lieu d'unions littérales.
- Cast peu sûrs : `m.role as 'user' | 'assistant'`, `Record<string, unknown>` partout.

### 6.3 Gestion d'erreurs
- `try/catch { /* ignore */ }` × 5+.
- `try/catch` qui `console.error` puis... rien à l'utilisateur.
- `Alert` réinvité dans chaque écran avec setTimeout(setMsg(''),3000) (NutritionTab, GLP1, Weight, Journal). Pas de toast système.
- Pas de logger centralisé.
- Pas d'error boundary global.

### 6.4 Sécurité applicative
- Edge Functions partagent un `cachedApiKey` global (mineur car mono-tenant Supabase).
- `details: errBody` (errors d'Anthropic) renvoyé brut au client.

### 6.5 Dead code & dette
- `index.html.backup` (65 KB) tracké dans git.
- `vitalcore.test.js` (12 KB) racine, orphelin (pas référencé par vitest).
- `ANON_KEY` exporté inutilement.
- `import React` dans 11+ fichiers alors que `jsx: react-jsx` rend l'import inutile.
- `subscriptions` table référencée dans `supabase-integration.test.ts` mais aucun écran de l'app ne l'utilise.

---

## 7. Performance

### 7.1 Réseau / requêtes
- **`useDashboardData.reload`** lance **12 requêtes parallèles** au mount. Sur cellulaire 4G ~200 ms × 12 / pipeline → ~1-2s avant interactivité utile.
- **CalendarTab** : N+1 — 1 requête `meals` par jour sélectionné.
- **`progress_photos`** chargées sans `limit` → si 200 photos, toutes les URLs publiques sont retournées et le DOM rend toutes les `<img>`.
- **`injection_logs.limit(30)`** sans cursor pagination → on perd l'historique long terme.

### 7.2 Bundle
- **Aucun code splitting** des routes : `FastingScreen`, `GLP1Screen`, `WeightScreen` (graphiques SVG inline lourds) sont chargés pour tous les utilisateurs même non-Premium / non-GLP-1.
- **Cible** : `React.lazy` + Suspense → -200 KB initial bundle.

### 7.3 Render
- Re-render par seconde dans `FastingScreen` (setInterval 1s + setTick).
- Re-render global du dashboard à chaque mutation via `useDashboardData`.
- Aucun `useMemo` sur les agrégations dans HomeTab / NutritionTab.

### 7.4 Images
- `PhotosScreen.upload` n'optimise PAS l'image (contrairement au scan repas qui resize 1024px).
- Pas de `loading="lazy"`, pas de `decoding="async"`.

### 7.5 Service Worker
- NetworkFirst sur `/rest/` 5 min, mais ne couvre PAS `/storage/` (photos) ni `/functions/` (Edge).
- Manifest icons : SVG seul → installation PWA dégradée sur iOS / certains Android.

### 7.6 Tailwind purge
- `Spinner` `w-${size}` → bug ; classe dynamique non détectée. Spinner invisible en prod.

---

## 8. Tests

### 8.1 Existant (7 fichiers, ~1000 LoC)
| Fichier | Couverture |
|---|---|
| `calculations.test.ts` | ✅ Excellent — 50+ tests, BMR/TDEE/age/macros/mood |
| `glp1.test.ts` | 🟠 Logique inline copiée — divergente du code prod |
| `fasting.test.ts` | 🔴 Tests `5:2` et `14:10` qui n'existent pas en prod |
| `nutrition.test.ts` | 🟠 Logique inline |
| `validation.test.ts` | 🟠 Bornes inlinées au lieu d'importées |
| `supabase-integration.test.ts` | ✅ Bons tests RLS/CRUD/CHECK ; ❌ Mais credentials commités, exclu de la CI par défaut |
| `setup.ts` | 🟠 Minimal (jest-dom seul) |

### 8.2 Manquant
- ❌ Aucun test UI (`@testing-library/react` installé mais inutilisé).
- ❌ Aucun test des hooks (`useDashboardData`, `useCalendarData`, `useAuth`).
- ❌ Aucun mock Supabase (MSW absent).
- ❌ Aucun test des Edge Functions (Deno test runner non utilisé).
- ❌ Aucun test sécurité : pas de test "user A ne peut pas update profile B", pas de test "user free ne peut pas s'auto-upgrade".
- ❌ Coverage limité à `utils/contexts/hooks` → screens à 0%.

### 8.3 CI/CD
- ❌ Aucune CI configurée (pas de `.github/workflows/`).
- ❌ Pas de hook pre-commit.
- ❌ `npm run build` n'est exécuté qu'au déploiement Vercel.

---

## 9. Infra, build, déploiement, PWA

### 9.1 Vercel
- ✅ `buildCommand: npm run build`, `outputDirectory: dist` corrects.
- ✅ Rewrite SPA `/(.*) → /index.html` correct.
- ❌ Aucun header de sécurité (cf. 2.9).
- ❌ Aucun `regions` configuré (latence sous-optimale pour utilisateurs français — défaut iad1 US).

### 9.2 Vite
- ✅ Vite 5 + React 18 + TS strict (sauf relâchements tsconfig).
- ⚠️ URL Supabase hardcodée dans `vite.config.ts:24` (regex SW) — duplication.
- ⚠️ Pas de `loadEnv` pour différencier les builds.

### 9.3 PWA
- ⚠️ Manifest icons : seul `icon.svg` référencé. **Installation iOS dégradée** (iOS exige PNG). À générer `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.
- ⚠️ Workbox `runtimeCaching` couvre seulement `/rest/` Supabase → pas Storage, pas Edge.
- ⚠️ `NetworkFirst` 5 min → pas de mode offline réel pour les listes utilisateur.
- ⚠️ `globPatterns` n'inclut pas `webp/avif`.
- ✅ `registerType: 'autoUpdate'` correct.

### 9.4 Tooling absent
- ❌ ESLint (alors que `eslint-disable-line` est utilisé dans le code).
- ❌ Prettier.
- ❌ Husky / lint-staged.
- ❌ Sentry / monitoring.
- ❌ Analytics (Plausible / PostHog).
- ❌ Tanstack Query / SWR.
- ❌ react-hot-toast / sonner.
- ❌ zod / valibot.
- ❌ react-error-boundary.

### 9.5 Git
- État sale : 9 fichiers modifiés non committés, 2 nouveaux écrans non trackés (`EcartScreen`, `HydrationScreen`) → divergence repo vs disque.
- Historique pollué : 5 commits "Deploy VitalCore v2.0 - All features" + 5 "Add .nojekyll" → ancienne stratégie de déploiement GitHub Pages laissée intacte.
- Branch unique `main`, pas de stratégie de branches (pas de develop / staging).

### 9.6 Fichiers à supprimer
- `index.html.backup` (65 KB).
- `vitalcore.test.js` (12 KB).
- `.nojekyll` (relique GitHub Pages).
- `scripts/create-test-accounts.mjs` (déjà gitignoré, mais à supprimer du disque après changement du mot de passe admin).

---

## 10. Plan de remédiation priorisé

### Phase 0 — Action immédiate (sous 24h)

| # | Action | Impact | Effort |
|---|---|---|---|
| 1 | **Révoquer le PAT Supabase** dans `.mcp.json` et émettre un nouveau | Critique | S |
| 2 | **Changer le mot de passe** `admin@vitalcore.app` (Premium en prod) | Critique | S |
| 3 | **Supprimer les 16 Edge Functions debug/legacy** en prod (admin, app, github-push×3, fix-and-push, push-b64-to-github, serve-app, serve-test, test-html, test-ping, test-ct, upload-site, deploy-site, deploy-to-storage, store-chunk) | Critique | S |
| 4 | **Activer `verify_jwt: true`** sur `suggest-meals`, `analyze-ecart`, `chat`, `analyze-meal-photo` | Critique | S |
| 5 | **Vérifier que `db-hardening.sql` est appliqué en prod** (notamment RLS sur `subscriptions`) | Critique | S |
| 6 | **Audit du code Stripe webhook** (signature ?) | Critique | M |

### Phase 1 — Sécurité & RGPD (sous 1 semaine)

| # | Action | Effort |
|---|---|---|
| 7 | Trigger Postgres `on_auth_user_created` qui crée `profiles` ; supprimer l'INSERT côté client | M |
| 8 | Trigger BEFORE UPDATE `profiles` qui rejette modif de `subscription_plan, tdee, email` | S |
| 9 | Bucket `photos` privé + `createSignedUrl` côté client | M |
| 10 | Headers de sécurité Vercel (CSP, HSTS, X-Frame-Options, etc.) | S |
| 11 | Rate limit serveur (`suggest-meals`, `analyze-ecart`, `analyze-meal-photo`) par user_id | M |
| 12 | `callEdge` envoie le JWT user (option `auth: 'user'`) | S |
| 13 | Stripe : ignorer `price_id` client, mapper côté serveur | S |
| 14 | Migration `.env` (Supabase URL/key) + `loadEnv` Vite | S |
| 15 | Pages CGU + Politique de confidentialité ; consentement explicite à l'inscription | M |
| 16 | Bouton "Supprimer mon compte" (Edge Function `delete-account` qui DELETE auth.users) | M |
| 17 | Bouton "Exporter mes données" (RGPD portabilité) | M |
| 18 | TTL `chat_messages` (purge > 90 jours via cron pg) | S |

### Phase 2 — Bugs P0/P1 fonctionnels (sous 2 semaines)

| # | Action | Effort |
|---|---|---|
| 19 | `OnboardedRoute` : afficher loader + erreur au lieu de retourner null | S |
| 20 | `HydrationScreen` : retour vers `/dashboard` (pas `/`) | S |
| 21 | `Spinner` : remplacer `w-${size}` par `style={{width:size}}` | S |
| 22 | Race conditions `addWater` (Home, Calendar, Hydration) → opération atomique (RPC ou flag local) | M |
| 23 | Double-submit guards : Coach send, Fasting start/stop, Setup med, Premium upgrade | S |
| 24 | Confirmations destructives : reset eau, stop fasting, stop med, delete meal | S |
| 25 | Validation par étape Onboarding | S |
| 26 | Demande `full_name` à l'onboarding | S |
| 27 | `WeightScreen` Alert error utilise variant error | S |
| 28 | Modals : Escape close + focus trap + aria | M |

### Phase 3 — Qualité, perf, tests (sous 4 semaines)

| # | Action | Effort |
|---|---|---|
| 29 | Migration vers **Tanstack Query** (1 hook par feature) | L |
| 30 | Toast system (react-hot-toast) | S |
| 31 | Error boundary global | S |
| 32 | Sentry intégré | M |
| 33 | Code splitting routes (`React.lazy`) | M |
| 34 | Resize image PhotosScreen | S |
| 35 | Centraliser constantes (`MEAL_TYPES`, `WATER_AMOUNTS`, magic numbers) dans `src/constants/*` | M |
| 36 | Pagination cursor injLogs/weightLogs/photos | M |
| 37 | ESLint + Prettier + Husky + lint-staged | M |
| 38 | Tests UI (LoginScreen, OnboardingScreen, NutritionTab) | L |
| 39 | Tests hooks (renderHook + MSW) | M |
| 40 | Tests Edge Functions (Deno.test) | M |
| 41 | CI GitHub Actions (build + tests + lint + a11y) | S |
| 42 | PWA : générer PNG icons 192/512 + maskable | S |
| 43 | Service Worker : couvrir `/storage/` et `/functions/` | S |

### Phase 4 — UX & confort (sous 6 semaines)

| # | Action |
|---|---|
| 44 | "Mot de passe oublié" |
| 45 | Édition repas / injection / mensurations existants |
| 46 | Mode dark |
| 47 | Pull-to-refresh |
| 48 | Undo après delete |
| 49 | Notifications push (rappel injection, jeûne fini) |
| 50 | Banner offline |

---

## Conclusion

L'application VitalCore est **fonctionnellement très complète** (8 écrans de feature avancés, 4 onglets principaux, Coach IA, scan IA, suggestions IA, jeûne, GLP-1, mensurations) et la qualité du design est cohérente. Mais l'app **n'est pas prête pour la production** :

- 🔴 **Sécurité critique** : un PAT admin sur disque, 16 fonctions debug en prod, des fonctions IA non authentifiées qui peuvent vider le budget Anthropic en quelques minutes, un `subscription_plan` potentiellement modifiable côté client, et des comptes test admin avec mot de passe trivial committés.
- 🔴 **Conformité RGPD inexistante** pour une app de santé qui traite des données art. 9 (médicaments, photos biométriques, journal d'humeur, conversations chat).
- 🟠 **Architecture fragile** : pas de cache layer, pas de toast system, pas d'error boundary, magic numbers partout, drift entre code source et fonctions déployées.
- 🟠 **UX bloquante** dans plusieurs cas (écran blanc si profile load fail, retour cassé sur Hydration, race conditions sur addWater).

**Décision produit recommandée** : suspendre tout nouveau développement de feature, exécuter la Phase 0 dans la journée, la Phase 1 sous 7 jours (la sécurité + RGPD sont incompatibles avec un service de santé en prod), puis Phase 2 avant tout marketing / acquisition d'utilisateurs.

L'app a un excellent potentiel produit ; elle a juste été codée vite, et les couches sécurité / qualité ont accumulé une dette qui doit être adressée avant tout passage à l'échelle.
