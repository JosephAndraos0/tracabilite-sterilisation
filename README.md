# Traçabilité Stérilisation

App interne pour tracer les charges de stérilisation : stérilisateur → cycle → sachets.

## 1. Créer le projet Firebase

1. Va sur https://console.firebase.google.com et clique "Ajouter un projet"
2. Donne-lui un nom (ex: `tracabilite-sterilisation`), continue avec les valeurs par défaut
3. Une fois le projet créé, dans le menu de gauche : **Build > Firestore Database** > "Créer une base de données" > mode production > choisis une région proche (ex: `northamerica-northeast1` pour Montréal)
4. Toujours dans le menu de gauche : **Build > Authentication** > "Get started" > onglet "Sign-in method" > active **Anonymous**
5. Retourne à la page d'accueil du projet (icône maison) > clique l'icône `</>` (Web) pour ajouter une app web > donne-lui un nom > "Enregistrer l'app"
6. Firebase te montre un bloc `firebaseConfig` avec des valeurs (`apiKey`, `authDomain`, etc.) — garde cette page ouverte, tu en as besoin à l'étape 3

## 2. Installer le projet localement

```bash
npm install
cp .env.example .env
```

Ouvre `.env` et colle les valeurs de `firebaseConfig` (étape 1.6) :

```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=tracabilite-sterilisation.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tracabilite-sterilisation
VITE_FIREBASE_STORAGE_BUCKET=tracabilite-sterilisation.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

## 3. Publier les règles de sécurité Firestore

Dans la console Firebase : **Build > Firestore Database > Règles**, colle le contenu de `firestore.rules` (déjà dans ce projet) et clique "Publier".

## 4. Tester en local

```bash
npm run dev
```

Ouvre le lien affiché (généralement `http://localhost:5173`). Ajoute tes stérilisateurs, crée une charge, teste l'impression.

## 5. Déployer (pour y accéder depuis la tablette)

Le plus simple avec ton pattern habituel (Vercel ou Netlify) :

```bash
npm run build
```

Ça génère un dossier `dist/`. Connecte le repo GitHub à Vercel ou Netlify, ou fais un drag-and-drop du dossier `dist/` sur https://app.netlify.com/drop pour un premier test rapide. **Important** : ajoute les mêmes variables `VITE_FIREBASE_...` dans les paramètres d'environnement du site sur Vercel/Netlify, sinon la connexion à Firebase va échouer en production.

Une fois déployé, ouvre le lien sur la tablette et ajoute-le à l'écran d'accueil pour un accès rapide (ça se comporte comme une app).

## Notes

- L'app se connecte en mode anonyme automatiquement (pas d'écran de login) — normal pour un appareil partagé.
- Les données sont partagées en temps réel : si jamais tu ouvres l'app sur deux appareils, elles restent synchronisées.
- La création d'une charge est une transaction atomique : le numéro de cycle du stérilisateur et l'enregistrement de la charge se font ensemble, donc pas de risque de doublons de numéro de cycle.
- Prochaine étape possible (pas incluse pour l'instant, comme discuté) : marquer quand/où chaque sachet est utilisé — le modèle de données peut être étendu pour ça plus tard sans tout refaire.
