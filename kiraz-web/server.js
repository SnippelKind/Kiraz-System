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
const ADMIN_ROLES = ['1484284804143906956', '1483765220114563072', '1483760533197951099'];

// Spezielle Leader Rolle, die als einziges die Checkliste sehen darf
const LEADER_ROLE = ['1484284804143906956', '1483765220114563072'];

// Exakte Reihenfolge der Rollen-IDs für die Checkliste (von oben nach unten)
const RANK_ORDER = [
    '1483764042513387520',
    '1483764208620404736',
    '986301076976312390',
    '1483764711617990686',
    '1483765084655321098',
    '584172285393371146',
    '1483765329392832624',
    '1483765429225787433',
    '1483765797741658214',
    '1483765834311667733',
    '1483765860064821328',
    '1483765887013093497',
    '1483760918511747223'
];

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
        
        // --- Den SERVER-Nicknamen auslesen ---
        const discordMember = memberResponse.data;
        // Priorität: 1. Server-Nickname, 2. Globaler Name, 3. Standard Username
        const displayName = discordMember.nick || discordMember.user.global_name || discordMember.user.username;

        if (roles.includes(REQUIRED_ROLE_ID)) {
            const isAdmin = roles.some(role => ADMIN_ROLES.includes(role));
            const isLeader = roles.includes(LEADER_ROLE); // Prüft auf die Leader Rolle

            req.session.isAuthorized = true; 
            req.session.username = displayName; 
            req.session.isAdmin = isAdmin; 
            req.session.isLeader = isLeader; // Speichert den Leader Status in der Session
            
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
            isAdmin: req.session.isAdmin || false,
            isLeader: req.session.isLeader || false // Gibt die Info ans Dashboard weiter
        });
    } else {
        res.status(401).json({ error: "Nicht eingeloggt" });
    }
});

// NEU: Fraktionsmitglieder vom Discord-Server abrufen (über Bot Token)
app.get('/api/faction-members', async (req, res) => {
    // Nur die Leitung darf diese Liste abrufen
    if (!req.session.isLeader) return res.status(403).json({ error: "Keine Rechte" });
    if (!process.env.BOT_TOKEN) return res.status(500).json({ error: "BOT_TOKEN fehlt in .env" });

    try {
        // 1. Hole Rollen-Infos (für die Namen der Ränge)
        const rolesRes = await axios.get(`https://discord.com/api/guilds/${REQUIRED_GUILD_ID}/roles`, {
            headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` }
        });
        const rolesData = rolesRes.data;

        // 2. Hole ALLE Mitglieder des Servers
        const membersRes = await axios.get(`https://discord.com/api/guilds/${REQUIRED_GUILD_ID}/members?limit=1000`, {
            headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` }
        });
        const membersData = membersRes.data;

        let factionMembers = [];

        // 3. Sortiere die Leute strikt nach deiner Reihenfolge
        RANK_ORDER.forEach(roleId => {
            const roleInfo = rolesData.find(r => r.id === roleId);
            const roleName = roleInfo ? roleInfo.name : "Unbekannter Rang";

            // Finde alle Mitglieder, die diese spezifische Rolle besitzen
            const people = membersData.filter(m => m.roles.includes(roleId));

            people.forEach(p => {
                // Verhindert Duplikate, falls ein User mehrere Rollen aus der Liste hat 
                if (!factionMembers.find(fm => fm.id === p.user.id)) {
                    const name = p.nick || p.user.global_name || p.user.username;
                    factionMembers.push({
                        id: p.user.id,
                        name: name,
                        rankId: roleId,
                        rankName: roleName
                    });
                }
            });
        });

        res.json(factionMembers);
    } catch (err) {
        console.error("Fehler beim Abrufen der Fraktionsmitglieder:", err.message);
        res.status(500).json({ error: "Discord API Fehler" });
    }
});

app.get('/dashboard', (req, res) => {
    if (!req.session.isAuthorized) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
