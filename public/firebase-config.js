// firebase-config.js
import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyAGj18BgsMXrjDoaYt1fvmhpkfulZpR6K0",
  authDomain: "mk-world-loja.firebaseapp.com",
  projectId: "mk-world-loja",
  storageBucket: "mk-world-loja.appspot.com",  // corrigido aqui
  messagingSenderId: "588590991974",
  appId: "1:588590991974:web:ad411ed83e9c00e0443ba7"
};

const app = initializeApp(firebaseConfig);

export default app;
