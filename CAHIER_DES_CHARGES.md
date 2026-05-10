# VitalCore — Cahier des charges complet

Application PWA de coaching santé : nutrition, jeûne intermittent, suivi GLP-1, hydratation, poids, mensurations, photos de progression, journal, et coach IA conversationnel.

---

## 1. Vision produit

VitalCore est un compagnon santé tout-en-un destiné principalement aux personnes en démarche de perte de poids (avec ou sans traitement GLP-1 type Ozempic / Mounjaro / Wegovy / Saxenda). L'utilisateur :

- s'inscrit, complète un onboarding qui calcule son TDEE (besoin calorique journalier) ;
- suit ses repas (manuel, scan photo IA, ou via suggestions IA) ;
- enregistre son hydratation, son poids, ses mensurations, ses photos avant/après ;
- pratique le jeûne intermittent (timer, phases physiologiques, historique) ;
- gère son traitement GLP-1 (titration, sites d'injection rotation, effets secondaires, prochaine injection) ;
- discute avec un coach IA (Claude) qui connaît tout son contexte ;
- peut analyser un écart alimentaire avant de le faire ("Si je mange une pizza, qu'est-ce que ça donne ?") ;
- débloque les fonctions avancées via un abonnement Premium (9.99€/mois, Stripe).

L'app est mobile-first (largeur max 430 px, mais responsive), installable en PWA, sans store nécessaire.

### Cibles utilisateurs
- **Persona 1 — Patient GLP-1** : suit un traitement injectable, doit logger ses doses, sites, effets secondaires et corréler avec poids.
- **Persona 2 — Régime libre** : veut perdre/maintenir son poids via nutrition + hydratation + jeûne intermittent.
- **Persona 3 — Sportif** : objectif prise de masse, surveille ses macros et sa progression.

---

## 2. Stack technique recommandée

| Couche | Choix |
|---|---|
| Framework | Vite + React 18 + TypeScript |
| Routing | React Router v6 |
| Styling | Tailwind CSS (couleurs custom : `primary=#4fd1c5` teal, `secondary=#3b82f6` blue) |
| State | React Context (auth) + hooks personnalisés (data) |
| Backend BaaS | Supabase (Postgres + Auth + Storage + Edge Functions Deno) |
| IA | Anthropic Claude (Haiku 4.5 pour chat/suggestions, Sonnet pour vision) |
| Paiement | Stripe Checkout (via Edge Function) |
| PWA | vite-plugin-pwa + Workbox (installable, service worker) |
| Hébergement front | Vercel |

### Charte graphique
- **Couleurs primaires** : teal `#4fd1c5` + blue `#3b82f6` en dégradé sur les en-têtes.
- **Fond** : `bg-slate-50` (#f8fafc).
- **Cartes** : blanches avec `rounded-2xl`, `shadow-sm`, `border-slate-100`.
- **Boutons primaires** : dégradé teal→blue, `rounded-xl`, animation `active:scale-95`.
- **Typo** : système (font-family par défaut), bold sur les KPI.
- **Largeur cadre** : `max-w-[430px] mx-auto` pour tout l'écran.

---

## 3. Architecture frontend

### 3.1 Arborescence des pages

```
/                            SplashScreen (logo animé, redirection)
/welcome                     WelcomeScreen (présentation + CTA login/signup)
/login                       LoginScreen
/signup                      SignupScreen
/onboarding                  OnboardingScreen (8 étapes, protected)
/dashboard                   HomeTab (KPIs + raccourcis, protected + onboarded)
/dashboard/nutrition         NutritionTab (4 sections repas + scan IA)
/dashboard/calendar          CalendarTab (vue mensuelle + détail jour)
/dashboard/coach             CoachTab (chat IA)
/dashboard/profile           ProfileTab (stats + plan nutritionnel + actions)
/dashboard/fasting           FastingScreen (timer + protocoles)
/dashboard/photos            PhotosScreen (upload avant/après)
/dashboard/glp1              GLP1Screen (médicament + injections)
/dashboard/weight            WeightScreen (poids + mensurations)
/dashboard/suggestions       SuggestionsScreen (idées repas IA)
/dashboard/ecart             EcartScreen (analyse impact écart)
/dashboard/hydration         HydrationScreen (hydratation détaillée)
```

### 3.2 Logique de navigation
- **Splash** → si session → `/dashboard` (ou `/onboarding` si non complété), sinon → `/welcome`.
- `ProtectedRoute` : exige `user` ; sinon redirige vers `/welcome`.
- `OnboardedRoute` : exige `profile.onboarding_completed === true` (ou présence de `height_cm`, `weight_kg`, `goal`) ; sinon redirige vers `/onboarding`.
- **BottomNav** affichée uniquement sur les 5 onglets principaux (Home / Nutrition / Calendar / Coach / Profile), masquée sur les écrans de feature détaillés.

### 3.3 État global

**AuthContext** expose :
- `user`, `profile`, `loading`
- `login(email, password)` → `{ error? }`
- `signup(email, password)` → `{ error?, success? }` (crée auto la ligne `profiles`)
- `logout()`
- `refreshProfile(userId?)`

Listener `onAuthStateChange` Supabase ; charge le profil dès que la session est connue ; fallback timeout 8 s pour ne pas bloquer le splash.

**useDashboardData(userId)** : hook unique qui charge en parallèle, à chaque entrée dans le dashboard, toutes les données du jour + 7 derniers jours :
- repas du jour + 7 jours
- 50 derniers messages de chat
- session de jeûne active + 10 dernières terminées
- photos de progression
- médicament actif + 30 derniers logs d'injection
- 30 derniers logs de poids
- eau du jour + 7 jours
- 30 dernières mensurations

Retourne aussi des setters (`setMeals`, etc.) et `reload()` pour revalidation après mutations.

**useCalendarData(userId)** : charge les données agrégées par jour pour un mois donné.

---

## 4. Spécifications détaillées par écran

### 4.1 Splash `/`
- Affiche le logo "VitalCore" centré sur dégradé teal→blue plein écran.
- Tente de récupérer la session via Supabase ; redirige automatiquement.

### 4.2 Welcome `/welcome`
- Logo + slogan ("Votre assistant santé tout-en-un").
- Carrousel de 3 cartes (Nutrition / Coach IA / Suivi GLP-1).
- 2 CTA : "Commencer" → `/signup`, "Se connecter" → `/login`.

### 4.3 Login `/login`
- Champs email + password, validation HTML5.
- Bouton "Connexion" (loading), lien "Créer un compte".
- Erreurs traduites en français (notamment "Email ou mot de passe incorrect").
- Détection erreurs réseau → message dédié.

### 4.4 Signup `/signup`
- Champs email + password (min 8 car).
- Crée le compte Supabase Auth, signe immédiatement, insère ligne `profiles` minimale (id, email, full_name vide, plan free).
- Si email déjà utilisé → message dédié.
- Redirige vers `/onboarding`.

### 4.5 Onboarding `/onboarding` — 8 étapes
Barre de progression linéaire (n/8). Champ par étape :
1. **Genre** (homme / femme / autre)
2. **Date de naissance** (date picker, 10 ≤ âge ≤ 110)
3. **Mesures** (taille cm 100-250, poids kg 20-500)
4. **Objectif** (perdre / maintenir / gagner / santé)
5. **Poids cible** (kg, optionnel — défaut = poids actuel)
6. **Niveau d'activité** (sédentaire / léger / modéré / actif / très actif)
7. **Médicament GLP-1** (aucun / Ozempic / Mounjaro / Saxenda / Wegovy)
8. **Régime alimentaire** (standard / cétogène / végétarien / vegan / méditerranéen / sans gluten)

**Fin** :
- Calcule `bmr` (Mifflin-St Jeor) et `tdee` (× facteur d'activité) côté client.
- `UPDATE profiles` avec toutes les valeurs + `onboarding_completed = true`.
- Si GLP-1 sélectionné → INSERT `medications` avec dose initiale, jour Lundi, prochaine injection à J+7.
- Redirige vers `/dashboard`.

### 4.6 HomeTab `/dashboard`

**En-tête** dégradé : "VitalCore" + sous-titre + salutation `Bonjour {prénom} 👋`.

**Bandeau Premium** (uniquement si `subscription_plan === 'free'`) : amber → ouvre PremiumModal.

**Section "Progression globale"** — grille 2×2 de KpiCard cliquables :
- **Poids** → progression % vers objectif, tendance 5j (`/dashboard/weight`)
- **Hydratation moy. 7j** → litres + % objectif + barre
- **Calories moy. 7j** → kcal moy + jours tracés (`/dashboard/nutrition`)
- **GLP-1** (si médicament actif) → "Aujourd'hui !" / "J-X" + pulse rouge si due (`/dashboard/glp1`), sinon **Calendrier** → jours tracés

**Section "Aujourd'hui"** :
- Carte TDEE (objectif kcal) avec barre consommé/objectif et label objectif (perte/maintien/muscle).
- Carte macros (protéines / glucides / graisses en g, addition de tous les repas du jour).
- **Carte Hydratation** :
  - Affiche `X.XL / Y.YL` + % + 8 émojis 💧 remplis selon progression
  - Boutons rapides +200ml / +330ml / +500ml / +750ml
  - Lien "Historique →" vers `/dashboard/hydration`
  - Bouton "Réinitialiser" si water > 0

**Section "Modules"** — grille 2×2 de cards bleu pâle cliquables :
- ⚖️ Poids (current vs target)
- 💉 GLP-1 (avec dot rouge animé si due)
- 📸 Photos
- ⏱️ Jeûne

### 4.7 NutritionTab `/dashboard/nutrition`

**Header** dégradé : "Nutrition" + date longue française + total kcal vs targetCal + barre + macros récap.

**2 raccourcis cards** :
- 💡 Idées repas (vers `/dashboard/suggestions`)
- 🍕 Faire un écart (vers `/dashboard/ecart`)

**Mini-bars macros** (3 col) si `targets` calculé : barre de progression par macro vs cible.

**4 sections repas** (Petit-déjeuner / Déjeuner / Collation / Dîner) avec :
- Header coloré (gradient orange / emerald / sky / violet) : emoji + label + cible kcal + total consommé + barre.
- Liste des repas enregistrés avec macros + bouton ✕ pour supprimer.
- Action bar : `+ Ajouter` (ouvre formulaire inline multi-lignes) + `📷` (déclenche scan photo IA).
- **Formulaire inline** :
  - Plusieurs lignes (`+ Ajouter une ligne`).
  - Chaque ligne : nom + kcal + bouton "P/G/L" pour étendre macros (protéines/glucides/lipides).
  - Si scan IA en cours → spinner "Claude analyse votre photo...".
  - Si scan terminé → preview image + carte info (confiance haute/moyenne/faible + détails + suggestions) ; les valeurs préremplissent une ligne.
  - Bouton "Enregistrer N aliments" → INSERT batch dans `meals`.

**Scan photo** :
- Resize côté client à 1024 px max, JPEG qualité 0.85, base64.
- POST `/functions/v1/analyze-meal-photo` avec `{ image_base64, media_type }` + JWT.
- 403 si non Premium → message dédié.
- Renvoie `{ analysis: { food_name, calories, protein_g, carbs_g, fat_g, fiber_g, confidence, details, suggestions } }`.

### 4.8 CalendarTab `/dashboard/calendar`

- Vue mensuelle classique (lundi → dimanche).
- Navigation `‹ Mois ›`.
- Chaque cellule jour : numéro + 4 dots colorés (calories / eau / poids / mensurations) selon présence de données.
- Jour aujourd'hui surligné teal, futur grisé, sélectionné en dégradé.
- Légende sous le calendrier.

**Détail jour** (carte qui s'ouvre quand on clique un jour) :
- Calories du jour vs TDEE + macros.
- Hydratation L vs L.
- Poids du jour si enregistré.
- Mensurations du jour si enregistrées.
- Liste des repas du jour.
- Boutons rapides "+ml" pour ajouter de l'eau ce jour-là.
- Champ pour enregistrer le poids ce jour-là.

### 4.9 CoachTab `/dashboard/coach`

- Layout chat plein écran : header dégradé + flux messages + chips suggestions + input.
- 5 chips d'amorçage : "Mon poids", "Que manger?", "Mes calories", "Conseils injection", "Jeûne".
- Bulles : utilisateur (teal aligné droite) / IA (slate aligné gauche), avec animation typing 3 dots.
- Sur envoi : POST `/functions/v1/chat` avec `{ message, user_id }` + JWT, timeout 30 s.
- Si 429 `limit_reached` (free 20 msg/jour) → message dédié.
- Persistance : les messages sont enregistrés côté serveur dans `chat_messages` ; rechargés au mount.

### 4.10 ProfileTab `/dashboard/profile`

- En-tête : nom + email + badge "⭐ Premium" ou "Gratuit".
- **Statistiques** (grille 2×2) : poids actuel, poids cible, taille, âge.
- **Plan nutritionnel** (si TDEE défini) :
  - Card `targetCal` kcal/jour + label objectif + explication ("TDEE − 500 kcal" pour perte, "+300" pour gain).
  - Répartition macros (protéines/glucides/lipides) en grammes + % + kcal.
  - **Répartition par repas** : 4 boutons cliquables (petit-déjeuner 25%, déjeuner 35%, collation 10%, dîner 30%) → ouvre `MealSuggestModal` (suggestions IA pour ce repas).
- 3 boutons : 📔 Journal, 💳 Abonnement, Déconnexion.

### 4.11 FastingScreen `/dashboard/fasting`

**Quand pas de jeûne actif** :
- Carte "Recommandé pour vous" : protocole choisi selon objectif et présence de GLP-1 (16:8 si GLP-1 ; 18:6 si perte ; sinon 16:8). Affiche TDEE.
- **Sélecteur de protocole** : 16:8 ⭐ / 18:6 🔥 / 20:4 💪 / 23:1 🏆 avec :
  - emoji + heures fenêtre repas + description + intensité (5 barres)
  - badge "Recommandé" sur le protocole conseillé
  - badge "⚠️ Avancé" si incompatible avec l'objectif ou GLP-1
- **Aperçu "Si vous démarrez maintenant"** : début jeûne / fenêtre repas / fin fenêtre.
- Bouton "⏱ Démarrer · {protocole}".
- **Stats** (3 col) : série actuelle (j) / cette semaine (n/7) / total complétés.
- **Historique** : 7 dernières sessions avec barre de progression.

**Pendant un jeûne actif** :
- **Timer SVG circulaire** (rayon 50, circonférence 2π·50) avec progression animée, couleur verte si objectif atteint, sinon teal.
- Affichage HH:MM écoulé + restant.
- Carte "🍽️ Fenêtre alimentaire" : ouvre à HH:MM, ferme à HH:MM, ou statut "✓ Fenêtre ouverte".
- Liste des repas du jour.
- **Carte phases physiologiques** :
  - 7 phases : 4h Glycémie, 8h Glycogène, 12h Cétose, 16h Lipolyse, 18h Autophagie, 20h Clarté mentale, 24h Cétose profonde.
  - Affiche phase actuelle (la plus haute atteinte) en surbrillance + prochaine étape.
  - Liste verticale des milestones avec ✓ pour validés.
- Bouton "⏹ Terminer le jeûne" → `UPDATE fasting_sessions SET ended_at, completed = (elapsed >= target_hours)`.

### 4.12 PhotosScreen `/dashboard/photos`

- Formulaire upload : champ poids + champ note + bouton "📸 Sélectionner une photo".
- Validation : max 10 Mo, type image.
- Upload Supabase Storage bucket `photos` à `{userId}/progress/{timestamp}.{ext}`, getPublicUrl.
- INSERT `progress_photos`.
- Si ≥ 2 photos → grille **Avant/Après** (la plus ancienne et la plus récente).
- **Galerie** complète (grille 2 col, aspect carré) avec date + poids overlay.

### 4.13 GLP1Screen `/dashboard/glp1`

**Si pas de médicament actif** : formulaire setup
- Médicament (Ozempic / Mounjaro / Saxenda / Wegovy)
- Jour d'injection hebdo (Lun-Dim)
- Affiche le protocole de titration ("commencer à X mg, monter par paliers de N semaines")
- Bouton "Configurer" → INSERT `medications` avec dose initiale et `next_injection` à J+7 du jour choisi.

**Si médicament actif** :
- **Bandeau countdown** coloré : "Aujourd'hui !" (orange), "Dans X jours" (vert), "En retard de X j" (rouge) + date longue.
- **Bouton ⚙️** : ouvre panneau settings (changer jour d'injection, arrêter le traitement → `active = false`).
- **Carte titration** :
  - Affiche les paliers du protocole : pills (`0.25mg → 0.5mg → 1mg → 2mg`).
  - Palier actuel surligné teal.
  - Barre "semaines à cette dose" sur les semaines requises ; badge "Montée possible ↑" si validé ; conseil de discuter avec son médecin.
  - Tables protocoles :
    - Ozempic : [0.25, 0.5, 1, 2] / paliers [4, 4, 4, 0] semaines
    - Mounjaro : [2.5, 5, 7.5, 10, 12.5, 15] / [4, 4, 4, 4, 4, 0]
    - Saxenda : [0.6, 1.2, 1.8, 2.4, 3] / [1, 1, 1, 1, 0]
    - Wegovy : [0.25, 0.5, 1, 1.7, 2.4] / [4, 4, 4, 4, 0]
- **Formulaire log injection** :
  - **Carte sites d'injection** (grille 3×2) : Abdomen G/D, Cuisse G/D, Bras G/D.
    - Site recommandé (le plus ancien dans `siteLastUsed`) en vert + ⭐.
    - Sites déjà utilisés affichent "Il y a Xj".
  - Champ dose (préremplissage = dose actuelle).
  - **Effets secondaires** (3 sliders 0-5) : 🤢 Nausée / 😴 Fatigue / 🤕 Douleur. Boutons ronds 0-5, vert 0-1, orange 2-3, rouge 4-5.
  - Champ notes optionnel.
  - Bouton "💉 Logger l'injection" → INSERT `injection_logs` + `UPDATE medications SET next_injection = J+7, dose_current = injDose`.
- **Carte graphiques** (si ≥ 2 injections) :
  - **DoseChart** : barres SVG des 12 dernières doses + dates premières/dernières.
  - **WeightSinceStart** : ligne SVG des poids depuis `start_date` du traitement, avec delta total kg.
- **Historique** des 10 dernières injections : dose, site, date, effets secondaires colorés.

### 4.14 WeightScreen `/dashboard/weight`

**Section Poids** :
- 3 KPIs : Actuel / Objectif / Restant.
- Carte progression : % + barre + delta total + dates départ/cible.
- **WeightChart SVG** : courbe + zone dégradée + ligne pointillée bleue à `targetWeight` + 20 derniers points + dates premier/dernier + dernière valeur en label.
- Formulaire enregistrement (poids + note) → upsert `weight_logs` + UPDATE `profiles.weight_kg` si jour = aujourd'hui.
- Historique 10 dernières mesures avec delta.

**Section Mensurations** :
- 5 mesures : 📏 Taille, 📐 Hanches, 📏 Poitrine, 💪 Bras, 🦵 Cuisse (en cm).
- Cards "dernières valeurs" avec mini-trend SVG.
- Formulaire pliable : grille 2 col + note.
- Historique 8 dernières fiches.

### 4.15 SuggestionsScreen `/dashboard/suggestions`

- Header : compteur "❤️ N" (aliments aimés).
- Carte profil : objectif kcal + grille macros (protéines / glucides / lipides).
- Panneau préférences pliable : aliments aimés (verts) et évités (rouges) avec bouton ×.
- **4 onglets repas** (Petit-déjeuner / Déjeuner / Collation / Dîner) avec emoji et kcal cible.
- À l'ouverture, charge automatiquement les suggestions du déjeuner.
- Pour chaque suggestion (3 par batch) :
  - Card avec emoji + nom + description + kcal + macros (3 col).
  - 3 boutons : 🚫 (dislike, remplace par une nouvelle suggestion), ➕ Ajouter au repas (INSERT `meals`), ❤️ J'aime (sauve dans localStorage).
- Bouton "🔄 Voir d'autres idées" → relance avec exclusions.
- Préférences stockées en `localStorage` clef `vitalcore_food_prefs_{userId}` (max 30 likes / 40 dislikes).

### 4.16 EcartScreen `/dashboard/ecart`

- Carte "Aujourd'hui" : kcal consommées / objectif + badge "X kcal restantes" ou "+X kcal dépassées".
- Textarea description ("une pizza margherita + 2 verres de vin...").
- Bouton "🔍 Analyser l'impact".
- POST `/functions/v1/analyze-ecart` avec `{ description, today_cal, tdee, goal, diet }` (à créer).
- Réponse : `{ estimated_cal, verdict (ok/modere/important), surplus_cal, message_principal, details, conseil, macro_estimate }`.
- Card résultat colorée selon verdict (vert / amber / orange) avec emoji + message + estimation kcal + surplus + macros + conseil.

### 4.17 HydrationScreen `/dashboard/hydration`

- Header bleu/cyan.
- **Anneau SVG circulaire** : progression du jour avec dégradé bleu→cyan, label "X.XL / Y.YL".
- 3 mini-stats : % progression, restant en ml, nombre de verres (todayWater / 250).
- 6 boutons rapides : +150 / +200 / +330 / +500 / +750 / +1000ml.
- Champ custom (input nombre + bouton +).
- **Histogramme 7 jours** : barres dégradées bleues si objectif atteint, bleu pâle sinon, ring sur aujourd'hui ; moyenne et "X/7 jours" objectif atteint.
- Bouton "✏️ Objectif" : modifier l'objectif personnalisé (500-6000 ml), sauvé dans `localStorage` clef `vitalcore_water_goal_{userId}`.
- Objectif par défaut = `weight_kg × 35`.

### 4.18 Modals

#### PremiumModal
- Titre "✨ VitalCore Premium" + prix 9.99€/mois + 6 features.
- Bouton "Upgrade Maintenant" → POST `/functions/v1/create-checkout` avec `{ user_id, price_id }` → redirige vers Stripe Checkout URL.

#### PaymentModal
- Affiche le plan actuel + bouton upgrade.

#### JournalModal (depuis Profile)
- Sélecteur d'humeur 1-5 (😞😔😐🙂😄).
- Textarea notes du jour.
- Bouton "Enregistrer" → INSERT `journal_entries`.
- **Histogramme** sur 7 derniers jours, barres colorées par humeur (rouge → vert).
- Liste des 5 dernières entrées.

#### MealSuggestModal (depuis Profile, click sur un repas)
- Affiche 3 suggestions IA pour le repas cible avec target_cal pré-rempli.
- Bouton "Ajouter" sur chaque suggestion → INSERT `meals` du jour.

---

## 5. Calculs métier (utils/calculations.ts)

```ts
calcBMR(gender, weight, height, age)         // Mifflin-St Jeor
  // homme: 10w + 6.25h − 5a + 5
  // femme/autre: 10w + 6.25h − 5a − 161

calcTDEE(bmr, activity)
  // sedentary 1.2, light 1.375, moderate 1.55, active 1.725, very_active 1.9

calcMacroTargets(tdee, weightKg, goal):
  targetCal = goal === 'lose'  ? max(tdee - 500, 1200)
            : goal === 'gain'  ? tdee + 300
            : tdee
  proteinPerKg = lose 2.0 | gain 1.8 | else 1.6
  proteinG = round(weightKg × proteinPerKg)
  fatG     = round(targetCal × 0.27 / 9)
  carbsG   = max(round((targetCal − proteinG×4 − fatG×9) / 4), 50)

calcAge(dob)         // depuis ISO
formatHours(hours)   // "12:34"
todayISO()           // "YYYY-MM-DD"
moodEmoji(1-5)       // 😞😔😐🙂😄
moodColor(1-5)       // rouge → vert
```

Hydratation : `goal = weight_kg × 35` ml.
Eau : 1 verre = 250 ml.
Répartition repas par défaut : 25% / 35% / 10% / 30%.

---

## 6. Backend — Supabase

### 6.1 Schéma Postgres

#### `profiles` (1-1 avec auth.users)
```
id                       uuid PK references auth.users.id
email                    text
full_name                text
gender                   text             -- male | female | other
date_of_birth            date
age                      int
height_cm                numeric
weight_kg                numeric
target_weight_kg         numeric
goal                     text             -- lose | maintain | gain | health
activity_level           text             -- sedentary | light | moderate | active | very_active
diet                     text             -- standard | keto | vegetarian | vegan | mediterranean | gluten_free
tdee                     int
subscription_plan        text default 'free'   -- free | premium
onboarding_completed     boolean default false
created_at               timestamptz default now()
```

#### `meals`
```
id           uuid PK
user_id      uuid → profiles.id (cascade)
meal_date    date
meal_type    text             -- breakfast | lunch | snack | dinner
food_name    text
calories     numeric
protein_g    numeric
carbs_g      numeric
fat_g        numeric
created_at   timestamptz default now()
INDEX (user_id, meal_date)
```

#### `chat_messages`
```
id           uuid PK
user_id      uuid → profiles.id
role         text             -- user | assistant
content      text
created_at   timestamptz default now()
INDEX (user_id, created_at)
```

#### `fasting_sessions`
```
id           uuid PK
user_id      uuid → profiles.id
protocol     text             -- 16:8 | 18:6 | 20:4 | 23:1
started_at   timestamptz
ended_at     timestamptz nullable
target_hours int
completed    boolean default false
INDEX (user_id, completed)
```

#### `progress_photos`
```
id           uuid PK
user_id      uuid → profiles.id
photo_url    text
weight_kg    numeric nullable
notes        text nullable
taken_at     timestamptz default now()
```

#### `medications`
```
id                uuid PK
user_id           uuid → profiles.id
medication_name   text             -- Ozempic | Mounjaro | Saxenda | Wegovy
dose_current      text
dose_unit         text default 'mg'
injection_day     text             -- Lundi..Dimanche
start_date        date
next_injection    date
active            boolean default true
created_at        timestamptz default now()
INDEX (user_id, active)
```

#### `injection_logs`
```
id              uuid PK
user_id         uuid → profiles.id
medication_id   uuid → medications.id
injection_date  date
dose            text
injection_site  text   -- Abdomen gauche/droit, Cuisse G/D, Bras G/D
notes           text nullable
nausea          int (0-5) default 0
fatigue         int (0-5) default 0
pain            int (0-5) default 0
created_at      timestamptz default now()
INDEX (user_id, injection_date desc)
```

#### `journal_entries`
```
id           uuid PK
user_id      uuid → profiles.id
entry_date   date
mood         int (1-5)
energy       int (1-5)
notes        text nullable
created_at   timestamptz default now()
```

#### `weight_logs`
```
id           uuid PK
user_id      uuid → profiles.id
weight_kg    numeric
logged_date  date
notes        text nullable
created_at   timestamptz default now()
UNIQUE (user_id, logged_date)
```

#### `body_measurements`
```
id            uuid PK
user_id       uuid → profiles.id
logged_date   date
waist_cm      numeric nullable
hips_cm       numeric nullable
chest_cm      numeric nullable
arm_cm        numeric nullable
thigh_cm      numeric nullable
notes         text nullable
created_at    timestamptz default now()
```

#### `water_logs`
```
id            uuid PK
user_id       uuid → profiles.id
amount_ml     int
logged_date   date
created_at    timestamptz default now()
UNIQUE (user_id, logged_date)
```

#### `app_config` (clé/valeur côté serveur — uniquement service role)
```
key          text PK            -- 'anthropic_api_key', 'stripe_secret_key', ...
value        jsonb
```

### 6.2 Row Level Security (RLS)

Activer RLS sur **toutes les tables utilisateur** :

```sql
-- Exemple sur meals (à dupliquer pour chaque table user-scoped)
CREATE POLICY "Users select own meals"
  ON meals FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own meals"
  ON meals FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own meals"
  ON meals FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users delete own meals"
  ON meals FOR DELETE USING (auth.uid() = user_id);
```

Sur `profiles` : SELECT/UPDATE seulement où `auth.uid() = id`. Pas de DELETE direct.
Sur `app_config` : aucun accès anon — uniquement service role.

### 6.3 Storage

Bucket `photos` :
- public read.
- INSERT politique : `auth.uid() IS NOT NULL` ET le path commence par `auth.uid()/`.

```sql
CREATE POLICY "Users upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);
```

### 6.4 Edge Functions Deno

Toutes les Edge Functions :
- gèrent CORS (`*`, methods POST + OPTIONS).
- exigent `Authorization: Bearer <jwt>` sauf `suggest-meals` (utilise apikey anon).
- récupèrent `anthropic_api_key` depuis `app_config` (cache en mémoire dans la fonction).
- modèles Claude : `claude-haiku-4-5-20251001` pour chat / suggestions, `claude-sonnet-4-20250514` pour vision.

#### `chat` — Coach IA conversationnel
**Input** : `{ message: string, user_id: string }`
**Sécurité** : valide JWT, gate Premium pour > 20 messages/jour (free).
**Logique** :
1. Charge en parallèle profil, 20 derniers messages, repas du jour, dernier poids, jeûne actif, médicament actif, count messages user du jour.
2. Si `!isPremium && dailyCount >= 20` → 429 `{ error: 'limit_reached' }`.
3. Construit un system prompt français avec : nom, objectif, TDEE, régime, activité, poids actuel/cible, GLP-1 si présent, calories du jour, repas du jour, jeûne en cours.
4. Appelle Claude avec history + user message, max 512 tokens.
5. Persiste les deux messages (user + assistant) dans `chat_messages`.
6. Renvoie `{ reply: string }`.

#### `analyze-meal-photo` — Scan IA repas
**Input** : `{ image_base64, media_type }`
**Sécurité** : JWT obligatoire, **403 si non Premium**.
**Logique** :
1. Récupère diet/goal/tdee de l'utilisateur.
2. System prompt : "expert nutritionniste, retourne UNIQUEMENT un JSON".
3. Appelle Claude Sonnet (vision) avec image + prompt.
4. Parse le JSON (regex `{[\s\S]*}` pour gérer les blocs markdown).
5. Renvoie `{ success: true, analysis: { food_name, calories, protein_g, carbs_g, fat_g, fiber_g, confidence: 'high'|'medium'|'low', details, suggestions } }`.

#### `suggest-meals` — Idées repas IA
**Input** : `{ meal_type, target_cal, liked_foods[], disliked_foods[], exclude_names[], count, diet, goal }`
**Sécurité** : apikey anon (pas besoin de JWT — usage léger).
**Logique** :
1. Construit le prompt : "Propose N idées pour {repas} ~{kcal} kcal, en respectant régime, aimés/évités/exclus".
2. Retry × 3 avec backoff exponentiel sur 529 (overloaded).
3. Renvoie `{ success: true, suggestions: [{ name, emoji, description, calories, protein_g, carbs_g, fat_g }] }`.

#### `analyze-ecart` — Analyse d'écart alimentaire
**Input** : `{ description, today_cal, tdee, goal, diet }`
**Sécurité** : JWT (free et premium).
**Logique** :
1. Prompt Claude : "Estime calories + macros de cette description, donne verdict ok/modere/important basé sur surplus_cal vs TDEE, message bienveillant".
2. Renvoie `{ success: true, analysis: { estimated_cal, verdict, surplus_cal, message_principal, details, conseil, macro_estimate: { protein_g, carbs_g, fat_g } } }`.

#### `create-checkout` — Stripe Checkout
**Input** : `{ user_id, price_id }`
**Sécurité** : JWT obligatoire.
**Logique** :
1. Récupère `stripe_secret_key` depuis `app_config`.
2. Crée une session Checkout (mode subscription, success_url = app, cancel_url = app).
3. Renvoie `{ url }` pour redirection.

#### `stripe-webhook` (à créer)
- Reçoit les événements Stripe (`checkout.session.completed`, `customer.subscription.deleted`, etc.).
- Met à jour `profiles.subscription_plan` selon l'événement.

---

## 7. Règles métier transversales

### 7.1 Free vs Premium (9.99€/mois)
| Feature | Free | Premium |
|---|---|---|
| Repas manuels | ✅ illimité | ✅ |
| Scan photo IA | ❌ 403 | ✅ |
| Coach IA | ✅ 20 msg/jour | ✅ illimité |
| Suggestions IA | ✅ | ✅ |
| Analyse écart | ✅ | ✅ |
| Jeûne | ✅ | ✅ |
| Photos progression | ✅ | ✅ |
| GLP-1 | ✅ | ✅ |
| Journal | ✅ basique | ✅ premium (à définir : graphiques avancés, export) |

> Note : actuellement le code rend de nombreuses features visibles aux free, mais le PremiumModal annonce "Repas illimités, Scan IA, Jeûne intermittent, Photos, GLP-1, Journal premium" comme exclusivement Premium. **Décision produit à clarifier** : verrouiller davantage de features ou garder le scan IA comme seul vrai gate.

### 7.2 Validation côté client
- Poids : 20–500 kg.
- Taille : 100–250 cm.
- Âge : 10–110 ans.
- Photo : ≤ 10 Mo, type `image/*`.
- Objectif eau : 500–6000 ml.
- Effets secondaires : 0–5.

### 7.3 Internationalisation
- App entièrement en **français** (textes UI, prompts IA, dates locales `fr-FR`, jours en français pour GLP-1).
- Pas de i18n requis pour la v1 ; structure prévue pour basculer plus tard si besoin.

### 7.4 PWA
- `manifest.json` : nom, icônes 192/512, theme `#4fd1c5`, display `standalone`.
- Service worker Workbox : pré-cache des assets, runtime cache pour les images Storage.
- Bouton "Ajouter à l'écran d'accueil" géré par le navigateur.

---

## 8. Sécurité & conformité

- **JWT obligatoire** sur toutes les Edge Functions sensibles (chat, analyse-meal, ecart, checkout).
- **Service role key** jamais exposée côté client.
- **API key Anthropic** stockée dans `app_config` (RLS verrouillée), récupérée côté serveur uniquement.
- **RLS strict** sur toutes les tables → un user n'accède qu'à ses propres lignes.
- **Storage** : path préfixé par `userId/` enforcé par policy.
- **CORS** : origin `*` accepté pour usage mobile/PWA.
- **Mentions légales** (à ajouter en footer) : conditions d'utilisation, politique de confidentialité, mention "ne remplace pas un avis médical".
- **GLP-1** : disclaimer affiché au moins une fois ("Toujours consulter votre médecin avant de modifier dose ou protocole").
- **RGPD** : prévoir export de données + suppression de compte (route `/profile` à étendre).

---

## 9. Configuration projet

### 9.1 Variables d'environnement
Front (`.env`) :
```
VITE_SUPABASE_URL=https://xxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

Edge Functions (Supabase secrets) :
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
# anthropic_api_key et stripe_secret_key sont stockées dans app_config
```

### 9.2 Tailwind config (essentiel)
```js
theme: {
  extend: {
    colors: {
      primary:      '#4fd1c5',
      'primary-dark': '#319795',
      secondary:    '#3b82f6',
    }
  }
}
```

### 9.3 Vite config
- `vite-plugin-pwa` avec `registerType: 'autoUpdate'`, manifest et workbox.
- Build vers `dist/`, `outDir` consommé par Vercel.

### 9.4 Vercel
- Build command : `npm run build`.
- Output : `dist`.
- `vercel.json` : redirige toutes les routes vers `index.html` (SPA).

---

## 10. Tests recommandés

Unit tests (Vitest) :
- `calcBMR`, `calcTDEE`, `calcMacroTargets`, `calcAge`, `formatHours`.
- Logique titration GLP-1 (`canIncrease`, `recommendedSite`).
- Logique jeûne (`getRecommended`, `getCompatibility`, phase courante).
- Validation poids/taille/âge à l'onboarding.

Integration tests :
- Flow signup → onboarding → dashboard.
- Insert + reload des repas affiche bien les totaux.
- Scan photo → préremplissage formulaire.
- Démarrage / arrêt jeûne.

---

## 11. Roadmap suggérée pour Lovable

**MVP (Sprint 1-2)** :
1. Auth complète + onboarding 8 étapes.
2. Dashboard Home (KPIs, hydratation, modules).
3. Nutrition (CRUD repas, sections par type, totaux).
4. Profile (stats + plan nutritionnel + déconnexion).
5. Schéma Supabase complet + RLS.

**Sprint 3** :
6. Coach IA (Edge Function chat + persistance messages).
7. Scan photo IA (Edge Function analyze-meal-photo).
8. Suggestions IA (Edge Function suggest-meals).

**Sprint 4** :
9. Jeûne intermittent (timer + phases + historique).
10. GLP-1 (setup + log + titration + graphiques).
11. Hydratation (anneau + 7j + objectif personnalisé).

**Sprint 5** :
12. Poids + mensurations (chart + history).
13. Photos progression (upload Storage + avant/après).
14. Calendrier (vue mensuelle + détail jour).
15. Journal modal.

**Sprint 6** :
16. Stripe Checkout + webhook.
17. Analyse d'écart (Edge Function analyze-ecart).
18. PWA install + offline cache.
19. Mentions légales + RGPD (export/suppression).

---

## 12. Annexes

### 12.1 Format de réponse IA — analyse-meal-photo
```json
{
  "food_name": "Salade César au poulet",
  "calories": 420,
  "protein_g": 32,
  "carbs_g": 15,
  "fat_g": 25,
  "fiber_g": 4,
  "confidence": "high",
  "details": "Poulet grillé, salade romaine, parmesan, croûtons, sauce César",
  "suggestions": "Excellent choix protéiné, attention à la sauce qui peut doubler les calories"
}
```

### 12.2 Format de réponse IA — suggest-meals
```json
{
  "suggestions": [
    {
      "name": "Bowl quinoa-poulet",
      "emoji": "🍲",
      "description": "Quinoa, poulet grillé, avocat, tomates cerises, vinaigrette citron",
      "calories": 480,
      "protein_g": 35,
      "carbs_g": 45,
      "fat_g": 18
    }
  ]
}
```

### 12.3 Format de réponse IA — analyze-ecart
```json
{
  "estimated_cal": 1200,
  "verdict": "important",
  "surplus_cal": 450,
  "message_principal": "C'est un écart conséquent, mais maîtrisable",
  "details": "Une pizza margherita représente environ 800 kcal, plus 2 verres de vin (~400 kcal). Ça met votre journée à 2450 kcal vs 2000 d'objectif.",
  "conseil": "Profitez-en sans culpabiliser ! Demain, repartez sur votre routine habituelle.",
  "macro_estimate": { "protein_g": 35, "carbs_g": 110, "fat_g": 50 }
}
```

### 12.4 Couleurs sémantiques
- Vert (`green-500/600/700`) : succès, objectif atteint, perte (favorable).
- Orange (`orange-400/500`) : attention, écart modéré, dépassement léger.
- Rouge (`red-500`) : alerte, injection en retard, écart important.
- Teal (`primary` #4fd1c5) : accent principal, progression.
- Blue (`secondary` #3b82f6) : eau, objectif, stats secondaires.
- Purple : mensurations.
- Amber : glucides, premium upsell.
- Pink : graisses, cuisse.
