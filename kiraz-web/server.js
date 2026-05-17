require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');

// --- NEU: Discord.js & Firebase Admin importieren ---
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const admin = require("firebase-admin");

// --- NEU: Firebase Admin über Render Umgebungsvariable laden ---
let serviceAccount;
try {
    // Wandelt den Text aus Render wieder in ein echtes JSON-Objekt um
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
} catch (error) {
    console.error("KRITISCHER FEHLER: FIREBASE_CREDENTIALS in Render ist leer oder fehlerhaft formatiert!");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 3000;

// Fraktions IDs
const REQUIRED_GUILD_ID = '1346576630751035533';
const REQUIRED_ROLE_ID = '1365489886022467705';

// Admin Rollen
const ADMIN_ROLES = ['1393797458366042205', '1394457300693024838', '1500290272276381716'];
const LEADER_ROLES = ['1484284804143906956', '1485002612372668557'];

const RANK_ORDER = [
    '1346576630767816869', '1346576630767816868', '1346576630767816867', 
    '1346576630767816866', '1346576630751035542', '1346576630751035541', 
    '1346576630751035540', '1346576630751035539', '1346576630751035538', 
    '1346576630751035537', '1346576630751035536', '1393759494722293850', 
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

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        res.redirect('/'); 
    });
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

app.get('/api/faction-members', async (req, res) => {
    if (!req.session.isLeader && !req.session.isAdmin) return res.status(403).json({ error: "Keine Rechte" });

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

        RANK_ORDER.forEach(roleId => {
            const roleInfo = rolesData.find(r => r.id === roleId);
            const roleName = roleInfo ? roleInfo.name : "Unbekannter Rang";
            const peopleWithRole = membersData.filter(m => m.roles.includes(roleId));

            peopleWithRole.forEach(p => {
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

app.listen(PORT, () => console.log(`Dashboard Server läuft auf Port ${PORT}`));


// ==========================================
// DISCORD BOT & SLASH COMMANDS LOGIK
// ==========================================

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const spindItems = [
    { name: 'SNS-Pistole', value: 'SNS-Pistole' },
    { name: 'Normale Pistole', value: 'Normale Pistole' },
    { name: 'MK2 Pistole', value: 'MK2 Pistole' },
    { name: '50. Pistole', value: '50. Pistole' },
    { name: 'Mikro SMG', value: 'Mikro SMG' },
    { name: 'Abgesägte Schrottflinte', value: 'Abgesägte Schrottflinte' }
];

// Die Definition der Befehle
const commands = [
    {
        name: 'einlagern',
        description: 'Legt Items in den Spind eines Mitglieds (Admin-Befehl)',
        options: [
            { name: 'mitglied', type: 6, description: 'Das Mitglied auswählen', required: true },
            { name: 'item', type: 3, description: 'Welches Item?', required: true, choices: spindItems },
            { name: 'anzahl', type: 4, description: 'Wie viele?', required: true }
        ]
    },
    {
        name: 'auslagern',
        description: 'Nimmt Items aus dem Spind eines Mitglieds (Admin-Befehl)',
        options: [
            { name: 'mitglied', type: 6, description: 'Das Mitglied auswählen', required: true },
            { name: 'item', type: 3, description: 'Welches Item?', required: true, choices: spindItems },
            { name: 'anzahl', type: 4, description: 'Wie viele?', required: true }
        ]
    }
];

client.once('ready', async () => {
    console.log(`🤖 Bot eingeloggt als ${client.user.tag}`);
    
    // Befehle automatisch auf dem Server registrieren
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, REQUIRED_GUILD_ID),
            { body: commands }
        );
        console.log('✅ Slash-Befehle erfolgreich registriert.');
    } catch (error) {
        console.error('❌ Fehler beim Registrieren der Befehle:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // Nur User mit der spezifischen Admin-Rolle dürfen die Befehle ausführen
    if (!interaction.member.roles.cache.has('1393797458366042205')) {
        return interaction.reply({ content: '❌ Du hast keine Berechtigung für diesen Befehl.', ephemeral: true });
    }

    if (interaction.commandName === 'einlagern' || interaction.commandName === 'auslagern') {
        const targetMember = interaction.options.getMember('mitglied');
        const item = interaction.options.getString('item');
        const anzahl = interaction.options.getInteger('anzahl');
        const action = interaction.commandName; // 'einlagern' oder 'auslagern'

        if (!targetMember) {
            return interaction.reply({ content: '❌ Mitglied konnte nicht gefunden werden.', ephemeral: true });
        }

        if (anzahl <= 0) {
            return interaction.reply({ content: '❌ Die Anzahl muss größer als 0 sein.', ephemeral: true });
        }

        // Wir nutzen den Server-Nickname (genau wie das Web-Panel es tut)
        const targetName = targetMember.nickname || targetMember.user.globalName || targetMember.user.username;
        const executorName = interaction.member.nickname || interaction.member.user.globalName || interaction.member.user.username;
        
        const docRef = db.collection("lockers").doc(targetName);

        try {
            // Firestore Transaktion (verhindert Überschneidungen)
            await db.runTransaction(async (t) => {
                const doc = await t.get(docRef);
                let items = {};
                if (doc.exists) items = doc.data().items || {};

                let currentAmount = items[item] || 0;

                if (action === 'einlagern') {
                    items[item] = currentAmount + anzahl;
                } else if (action === 'auslagern') {
                    items[item] = Math.max(0, currentAmount - anzahl);
                }

                t.set(docRef, { items: items }, { merge: true });
            });

            // Aktion in der Protokoll-Datenbank verewigen (für das "System Protokoll" Tab)
            let actText = action === 'einlagern' ? 'eingelagert' : 'entnommen';
            await db.collection("logs").add({
                user: executorName,
                action: `Discord Bot Befehl (/${action})`,
                details: `${anzahl}x ${item} bei ${targetName} ${actText}.`,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            const emoji = action === 'einlagern' ? '📥' : '📤';
            interaction.reply({ content: `${emoji} Erfolgreich **${anzahl}x ${item}** beim Spind von **${targetName}** ${actText}.` });

        } catch (error) {
            console.error("Datenbank Fehler beim Slash-Command:", error);
            interaction.reply({ content: '❌ Es gab einen Datenbank-Fehler beim Verarbeiten des Befehls.', ephemeral: true });
        }
    }
});

// Bot starten
client.login(process.env.BOT_TOKEN);
