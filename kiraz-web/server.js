require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Fraktions IDs
const REQUIRED_GUILD_ID = '1483733301737951323';
const REQUIRED_ROLE_ID = '1483760063687426170';

// NEU: Admin Rollen (die löschen dürfen)
const ADMIN_ROLES = ['1484284804143906956', '1483760533197951099'];

// Session Setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'geheimes-kiraz-passwort-123',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 Stunden eingeloggt bleiben
}));

// Statische Dateien (Bilder) zugänglich machen
app.use('/public', express.static(path.join(__dirname, 'public')));

// 1. Startseite (Prüft ob eingeloggt)
app.get('/', (req, res) => {
    if (req.session.isAuthorized) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// 2. Leitet zu Discord weiter
app.get('/login', (req, res) => {
    // guilds.members.read wird benötigt, um die Rollen auf deinem Server zu lesen!
    const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds.members.read`;
    res.redirect(authorizeUrl);
});

// 3. Discord leitet hierhin zurück
app.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send('Kein Auth-Code erhalten.');

    try {
        // Tausche Code gegen Token
        const params = new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env.REDIRECT_URI
        });

        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const accessToken = tokenResponse.data.access_token;

        // Hole die Daten des Users auf deinem spezifischen Server
        const memberResponse = await axios.get(`https://discord.com/api/users/@me/guilds/${REQUIRED_GUILD_ID}/member`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const roles = memberResponse.data.roles; // Array aller Rollen-IDs des Users
        
        // Den Discord-Namen auslesen
        const discordUser = memberResponse.data.user;
        const displayName = discordUser.global_name || discordUser.username;

        // Prüfe ob die Basis-Rolle dabei ist, um überhaupt aufs Dashboard zu kommen
        if (roles.includes(REQUIRED_ROLE_ID)) {
            
            // NEU: Prüfen, ob der User eine der Admin-Rollen hat
            const isAdmin = roles.some(role => ADMIN_ROLES.includes(role));

            req.session.isAuthorized = true; // Türsteher sagt JA
            req.session.username = displayName; // Speichert den Namen in der Session
            req.session.isAdmin = isAdmin; // Speichert, ob der User Admin ist

            res.redirect('/dashboard');
        } else {
            res.status(403).send('<h1>Zugriff verweigert</h1><p>Du bist zwar auf dem Server, hast aber nicht die benötigte Rolle.</p>');
        }

    } catch (error) {
        console.error("Fehler bei Discord API:", error.response ? error.response.data : error.message);
        res.status(403).send('<h1>Zugriff verweigert</h1><p>Du bist nicht auf dem Discord-Server oder ein Fehler ist aufgetreten.</p>');
    }
});

// --- NEU: Kleine API, damit das Dashboard den Namen UND Admin-Status abfragen kann ---
app.get('/api/user', (req, res) => {
    if (req.session.isAuthorized && req.session.username) {
        res.json({ 
            username: req.session.username,
            isAdmin: req.session.isAdmin || false // Schickt mit, ob Admin
        });
    } else {
        res.status(401).json({ error: "Nicht eingeloggt" });
    }
});

// 4. Das geschützte Dashboard
app.get('/dashboard', (req, res) => {
    if (!req.session.isAuthorized) {
        return res.redirect('/'); // Zurück zum Login, wenn nicht autorisiert
    }
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
