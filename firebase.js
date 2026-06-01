import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyB6GIak8KnsFltk5q1UuDRJQZsc4M-t8m8",
    authDomain: "golf-tournament-2026-27dfe.firebaseapp.com",
    databaseURL: "https://golf-tournament-2026-27dfe-default-rtdb.firebaseio.com",
    projectId: "golf-tournament-2026-27dfe",
    storageBucket: "golf-tournament-2026-27dfe.firebasestorage.app",
    messagingSenderId: "924539685973",
    appId: "1:924539685973:web:f9bca434cc0b65edf018dc",
    measurementId: "G-DFYXNWPY4X"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export function saveScores(scores) {
    set(ref(db, 'scores'), scores);
}

export function savePairings(pairings) {
    set(ref(db, 'pairings'), pairings);
}

export function onScoresUpdate(callback) {
    onValue(ref(db, 'scores'), (snapshot) => {
        const data = snapshot.val();
        if (data) callback(data);
    });
}

export function onPairingsUpdate(callback) {
    onValue(ref(db, 'pairings'), (snapshot) => {
        const data = snapshot.val();
        if (data) callback(data);
    });
}
