const fallbackFirebaseConfig = Object.freeze({
  apiKey: "AIzaSyD5VSkbl9S7SiLmuWqoV43Z552yVZm49N4",
  authDomain: "ok-website-forum.firebaseapp.com",
  projectId: "ok-website-forum",
  storageBucket: "ok-website-forum.firebasestorage.app",
  messagingSenderId: "651707653519",
  appId: "1:651707653519:web:8e4f821931958676ff3ffa",
});

const requiredKeys = Object.freeze([
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
]);

export const getFirebaseConfig = () => {
  const runtimeConfig = globalThis.__FIREBASE_CONFIG__;
  const candidate =
    runtimeConfig && typeof runtimeConfig === "object"
      ? runtimeConfig
      : fallbackFirebaseConfig;

  for (const key of requiredKeys) {
    if (typeof candidate[key] !== "string" || candidate[key].trim() === "") {
      throw new Error(`Invalid Firebase config: missing ${key}`);
    }
  }

  return Object.freeze({
    apiKey: candidate.apiKey.trim(),
    authDomain: candidate.authDomain.trim(),
    projectId: candidate.projectId.trim(),
    storageBucket: candidate.storageBucket.trim(),
    messagingSenderId: candidate.messagingSenderId.trim(),
    appId: candidate.appId.trim(),
  });
};
