import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

// Ces valeurs viennent de ton fichier .env (voir .env.example).
// Va dans la console Firebase > Paramètres du projet > tes apps > config SDK
// pour les trouver.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// L'appareil est partagé (kiosk) : on s'authentifie silencieusement en mode
// anonyme. Ça permet quand même de protéger la base avec des règles Firestore
// (voir firestore.rules) au lieu de la laisser complètement ouverte.
//
// `authStateReady()` attend que Firebase ait fini de charger l'état stocké
// (évite de rester bloqué au démarrage) ; ensuite on se connecte si besoin.
// Un délai de sécurité évite un « Chargement… » infini si le réseau coince.
export async function ensureAuth() {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Délai de connexion dépassé")), 15000)
  );
  const cred = await Promise.race([signInAnonymously(auth), timeout]);
  return cred.user;
}
