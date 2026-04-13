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

// Admin Rollen
const ADMIN_ROLES = ['1484284804143906956', '1483765220114563072', '1483760533197951099'];

// Leader Rollen (inklusive der neuen ID)
const LEADER_ROLES = ['1484284804143906956', '1485002612372668557'];

// Exakte Reihenfolge der Rollen-IDs für die Checkliste
const RANK_ORDER = [
    '1483764042513387520',
    '1483764208620404736',
    '986301076976312390', // Sicherstellen, dass diese ID hier steht
    '1483764711617990686',
    '1483765084655321098',
    '584172285393371146', // Sicherstellen, dass diese ID hier steht
    '1483765329392832624',
    '1483765429225787433',
    '1483765797741658214',
    '1483765834311667733',
    '1483765860064821328',
    '1483765887013093497',
    '1483760918511747223'
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
