// IMPORTANT: Replace with your actual Firebase project configuration
// Get this from your Firebase project settings > General > Your apps > Web app
const firebaseConfig = {
  apiKey: "AIzaSyAzyy2QgCQN11bt7gKhj4FnD2zAWDCW-Dg",
  authDomain: "adai02.firebaseapp.com",
  projectId: "adai02",
  storageBucket: "adai02.firebasestorage.app",
  messagingSenderId: "7345157661",
  appId: "1:7345157661:web:e7603dbb585c5bcc9bf8f4",
  measurementId: "G-2LH0E7KV1M"
};

// Initialize Firebase
if (!firebase.apps.length) { // Prevent re-initialization
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase Initialized.");
} else {
    firebase.app(); // if already initialized, use that app
    console.log("Firebase already initialized.");
}
// const auth = firebase.auth(); // Can get auth instance where needed in script.js
// const db = firebase.firestore(); // Optional: If you use Firestore
