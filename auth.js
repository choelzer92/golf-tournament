const PIN_HASH = 'a4f731e221446a9aaa895e037815444d86fc05c95750e812cbc56dda876adee0';

async function hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkAuth() {
    const stored = localStorage.getItem('golf-tournament-pin');
    if (stored === PIN_HASH) return true;
    return false;
}

async function attemptLogin(pin) {
    const hashed = await hashPin(pin);
    if (hashed === PIN_HASH) {
        localStorage.setItem('golf-tournament-pin', hashed);
        return true;
    }
    return false;
}

function showLoginScreen() {
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
}

function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
}
