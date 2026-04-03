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

// Admin Rollen (die löschen, setzen und bearbeiten dürfen)
const ADMIN_ROLES = ['1484284804143906956', '1483760533197951099'];

// Verhindert, dass alte Versionen im Browser gecached werden
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// Session Setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'geheimes-kiraz-passwort-123',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    if (req.session.isAuthorized) return res.redirect('/dashboard');
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/login', (req, res) => {
    const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds.members.read`;
    res.redirect(authorizeUrl);
});

app.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send('Kein Auth-Code erhalten.');

    try {
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

        const memberResponse = await axios.get(`https://discord.com/api/users/@me/guilds/${REQUIRED_GUILD_ID}/member`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const roles = memberResponse.data.roles; 
        
        // --- NEU: Den SERVER-Nicknamen auslesen ---
        const discordMember = memberResponse.data;
        // Priorität: 1. Server-Nickname, 2. Globaler Name, 3. Standard Username
        const displayName = discordMember.nick || discordMember.user.global_name || discordMember.user.username;

        if (roles.includes(REQUIRED_ROLE_ID)) {
            const isAdmin = roles.some(role => ADMIN_ROLES.includes(role));
            req.session.isAuthorized = true; 
            req.session.username = displayName; 
            req.session.isAdmin = isAdmin; 
            res.redirect('/dashboard');
        } else {
            res.status(403).send('<h1>Zugriff verweigert</h1><p>Du bist zwar auf dem Server, hast aber nicht die benötigte Rolle.</p>');
        }
    } catch (error) {
        console.error("Fehler bei Discord API:", error.response ? error.response.data : error.message);
        res.status(403).send('<h1>Zugriff verweigert</h1><p>Du bist nicht auf dem Discord-Server oder ein Fehler ist aufgetreten.</p>');
    }
});

app.get('/api/user', (req, res) => {
    if (req.session.isAuthorized && req.session.username) {
        res.json({ 
            username: req.session.username,
            isAdmin: req.session.isAdmin || false 
        });
    } else {
        res.status(401).json({ error: "Nicht eingeloggt" });
    }
});

app.get('/dashboard', (req, res) => {
    if (!req.session.isAuthorized) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
