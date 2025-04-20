// IMPORTANT: Replace with your actual Firebase project configuration
// Get this from your Firebase project settings > General > Your apps > Web app
const firebaseConfig = {
  apiKey: "AIzaSyA6pi_wJowqykEwanlFtEBQ3o0rSrXDqiQ",
  authDomain: "wlaaiproject.firebaseapp.com",
  projectId: "wlaaiproject",
  storageBucket: "wlaaiproject.firebasestorage.app",
  messagingSenderId: "259132340735",
  appId: "1:259132340735:web:129ee43b128692e0df4fca",
  measurementId: "G-NT181W1S22"
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