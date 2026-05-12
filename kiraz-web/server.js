require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Fraktions IDs
const REQUIRED_GUILD_ID = '1346576630751035533';
const REQUIRED_ROLE_ID = '1365489886022467705';

// Admin Rollen
const ADMIN_ROLES = ['1393797458366042205', '1394457300693024838', '1500290272276381716'];

// Leader Rollen (inklusive der neuen ID)
const LEADER_ROLES = ['1484284804143906956', '1485002612372668557'];

// Exakte Reihenfolge der Rollen-IDs für die Checkliste
const RANK_ORDER = [
    '1346576630767816869', // 12
    '1346576630767816868', // 11
    '1346576630767816867', // 10
    '1346576630767816866', // 09
    '1346576630751035542', // 08
    '1346576630751035541', // 07
    '1346576630751035540', // 06
    '1346576630751035539', // 05
    '1346576630751035538', // 04
    '1346576630751035537', // 03 
    '1346576630751035536', // 02
    '1393759494722293850', // 01
    '1483760918511747223' // 00
];

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

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
        const displayName = memberResponse.data.nick || memberResponse.data.user.global_name || memberResponse.data.user.username;

        if (roles.includes(REQUIRED_ROLE_ID)) {
            req.session.isAuthorized = true; 
            req.session.username = displayName; 
            req.session.isAdmin = roles.some(role => ADMIN_ROLES.includes(role));
            req.session.isLeader = roles.some(role => LEADER_ROLES.includes(role)); 
            
            res.redirect('/dashboard');
        } else {
            res.status(403).send('Zugriff verweigert.');
        }
    } catch (error) {
        res.status(403).send('Fehler beim Login.');
    }
});

app.get('/api/user', (req, res) => {
    if (req.session.isAuthorized) {
        res.json({ 
            username: req.session.username,
            isAdmin: req.session.isAdmin || false,
            isLeader: req.session.isLeader || false 
        });
    } else {
        res.status(401).json({ error: "Nicht eingeloggt" });
    }
});

// ÜBERARBEITET: Spezifischer Fix für die Anzeige aller Rollen
app.get('/api/faction-members', async (req, res) => {
    if (!req.session.isLeader) return res.status(403).json({ error: "Keine Rechte" });

    try {
        const [rolesRes, membersRes] = await Promise.all([
            axios.get(`https://discord.com/api/guilds/${REQUIRED_GUILD_ID}/roles`, {
                headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` }
            }),
            axios.get(`https://discord.com/api/guilds/${REQUIRED_GUILD_ID}/members?limit=1000`, {
                headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` }
            })
        ]);

        const rolesData = rolesRes.data;
        const membersData = membersRes.data;
        let factionMembers = [];

        // Wir gehen die RANK_ORDER durch, um die Sortierung beizubehalten
        RANK_ORDER.forEach(roleId => {
            const roleInfo = rolesData.find(r => r.id === roleId);
            const roleName = roleInfo ? roleInfo.name : "Unbekannter Rang";

            // Alle Mitglieder finden, die GENAU diese Rolle haben
            const peopleWithRole = membersData.filter(m => m.roles.includes(roleId));

            peopleWithRole.forEach(p => {
                // Nur hinzufügen, wenn noch nicht in der Liste (vermeidet Dopplungen bei mehreren Rollen)
                if (!factionMembers.some(fm => fm.id === p.user.id)) {
                    factionMembers.push({
                        id: p.user.id,
                        name: p.nick || p.user.global_name || p.user.username,
                        rankId: roleId,
                        rankName: roleName
                    });
                }
            });
        });

        res.json(factionMembers);
    } catch (err) {
        res.status(500).json({ error: "Discord API Fehler" });
    }
});

app.get('/dashboard', (req, res) => {
    if (!req.session.isAuthorized) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
