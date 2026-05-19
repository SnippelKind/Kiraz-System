require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');

// --- Discord.js & Firebase Admin importieren ---
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const admin = require("firebase-admin");

// --- Firebase Admin über Render Umgebungsvariable laden ---
let serviceAccount;
try {
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
} catch (error) {
    console.error("KRITISCHER FEHLER: FIREBASE_CREDENTIALS ist leer oder fehlerhaft formatiert!");
}

if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 3000;

// --- EINSTELLUNGEN ---
const CREATOR_ID = '444942593864761369'; // DEINE ID
const REQUIRED_GUILD_ID = '1346576630751035533';
const REQUIRED_ROLE_ID = '1365489886022467705';

// Admin / Leader Rollen
const ADMIN_ROLES = ['1393797458366042205', '1394457300693024838', '1500290272276381716'];
const LEADER_ROLES = ['1484284804143906956', '1485002612372668557'];

// Exakte Reihenfolge der Rollen-IDs für die Checkliste
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
        const userId = memberResponse.data.user.id;
        
        const isCreator = userId === CREATOR_ID;

        if (roles.includes(REQUIRED_ROLE_ID) || isCreator) {
            req.session.isAuthorized = true; 
            req.session.username = displayName; 
            req.session.isAdmin = isCreator || roles.some(role => ADMIN_ROLES.includes(role));
            req.session.isLeader = isCreator || roles.some(role => LEADER_ROLES.includes(role)); 
            
            // Berechtigung für das Sonder-Lager speichern (Rolle 1393797458366042205 oder Creator)
            req.session.isStorageAdmin = isCreator || roles.includes('1393797458366042205');
            
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
            isLeader: req.session.isLeader || false,
            isStorageAdmin: req.session.isStorageAdmin || false 
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

app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));


// ==========================================
// DISCORD BOT & SLASH COMMANDS LOGIK
// ==========================================

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ] 
});

const spindItems = [
    { name: 'SNS-Pistole', value: 'SNS-Pistole' },
    { name: 'Normale Pistole', value: 'Normale Pistole' },
    { name: 'MK2 Pistole', value: 'MK2 Pistole' },
    { name: '50. Pistole', value: '50. Pistole' },
    { name: 'Mikro SMG', value: 'Mikro SMG' },
    { name: 'Abgesägte Schrottflinte', value: 'Abgesägte Schrottflinte' }
];

const commands = [
    {
        name: 'einlagern',
        description: 'Legt Items in den Spind eines Mitglieds (Admin)',
        options: [
            { name: 'mitglied', type: 6, description: 'Das Mitglied auswählen', required: true },
            { name: 'item', type: 3, description: 'Welches Item?', required: true, choices: spindItems },
            { name: 'anzahl', type: 4, description: 'Wie viele?', required: true }
        ]
    },
    {
        name: 'auslagern',
        description: 'Nimmt Items aus dem Spind eines Mitglieds (Admin)',
        options: [
            { name: 'mitglied', type: 6, description: 'Das Mitglied auswählen', required: true },
            { name: 'item', type: 3, description: 'Welches Item?', required: true, choices: spindItems },
            { name: 'anzahl', type: 4, description: 'Wie viele?', required: true }
        ]
    },
    {
        name: 'bestand',
        description: 'Zeigt den aktuellen Spind-Bestand eines Mitglieds (Admin)',
        options: [
            { name: 'mitglied', type: 6, description: 'Das Mitglied auswählen', required: true }
        ]
    },
    {
        name: 'bestandkomplett',
        description: 'Zeigt den gesamten Bestand aller Spinde zusammengerechnet (Admin)'
    },
    {
        name: 'sonderlager',
        description: 'Verwaltet die Sonder-Lager (10ner & Main) - Nur Leitung',
        options: [
            {
                name: 'aktion',
                type: 3, 
                description: 'Was möchtest du tun?',
                required: true,
                choices: [
                    { name: 'Einlagern', value: 'einlagern' },
                    { name: 'Auslagern', value: 'auslagern' },
                    { name: 'Bestand anzeigen', value: 'bestand' }
                ]
            },
            {
                name: 'lager',
                type: 3, 
                description: 'Welches Lager?',
                required: true,
                choices: [
                    { name: '10ner Lager', value: '10ner_Lager' },
                    { name: 'Mainlager', value: 'Mainlager' }
                ]
            },
            {
                name: 'item',
                type: 3, 
                description: 'Welches Item? (Pflicht bei Ein-/Auslagern)',
                required: false,
                choices: spindItems
            },
            {
                name: 'anzahl',
                type: 4, 
                description: 'Wie viele? (Pflicht bei Ein-/Auslagern)',
                required: false
            }
        ]
    },
    {
        name: 'sanktion',
        description: 'Stellt eine Sanktion aus (Nur berechtigte Leitung)',
        options: [
            { name: 'mitglied', type: 6, description: 'Das zu sanktionierende Mitglied', required: true },
            { name: 'grund', type: 3, description: 'Grund für die Sanktion', required: true },
            { name: 'betrag', type: 4, description: 'Betrag in € (nur die Zahl)', required: true },
            { name: 'datum', type: 3, description: 'Bis wann muss bezahlt werden?', required: true }
        ]
    },
    {
        name: 'abmeldung',
        description: 'Meldet ein Mitglied ab',
        options: [
            { name: 'mitglied', type: 6, description: 'Welches Mitglied meldet sich ab?', required: true },
            { name: 'grund', type: 3, description: 'Grund der Abmeldung', required: true },
            { name: 'bis_wann', type: 3, description: 'Bis wann? (WICHTIG: Format TT.MM.JJJJ z.B. 24.12.2026)', required: true }
        ]
    },
    {
        name: 'abgemeldet',
        description: 'Zeigt eine Liste aller aktuell Abgemeldeten'
    },
    {
        name: 'verwaltung',
        description: 'Sendet eine Team-Übersicht in den Verwaltungs-Channel (Admin)'
    },
    {
        name: 'online',
        description: 'Zeigt die aktuellen Spieler auf dem FiveM Server an (Admin)'
    },
    {
        name: 'arbeiter',
        description: 'Trägt einen neuen Arbeiter ein',
        options: [
            { name: 'vom_wem', type: 6, description: 'Welches Fraktionsmitglied hat ihn eingestellt?', required: true },
            { name: 'name', type: 3, description: 'Vor- und Nachname des Arbeiters', required: true },
            { name: 'ausweis', type: 11, description: 'Bild vom Ausweis (Datei hochladen)', required: true },
            { name: 'telefonnummer', type: 3, description: 'Telefonnummer des Arbeiters', required: false }
        ]
    },
    {
        name: 'arbeiter_entfernen',
        description: 'Trägt einen Arbeiter aus der Liste wieder aus',
        options: [
            { name: 'name', type: 3, description: 'Exakter Vor- und Nachname des Arbeiters', required: true }
        ]
    },
    {
        name: 'arbeiterliste',
        description: 'Zeigt eine Liste aller aktiven, eingetragenen Arbeiter'
    },
    {
        name: 'befehle',
        description: 'Listet alle verfügbaren Bot-Befehle übersichtlich auf'
    }
];

client.once('ready', async () => {
    console.log(`🤖 Bot eingeloggt als ${client.user.tag}`);
    
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

    const cmd = interaction.commandName;
    const isCreator = interaction.user.id === CREATOR_ID;

    // ==========================================
    // BEFEHLS-ÜBERSICHT
    // ==========================================
    if (cmd === 'befehle') {
        const befehleEmbed = new EmbedBuilder()
            .setColor('#2C2F33') 
            .setTitle('⚙️ Bot Befehlsübersicht')
            .setDescription('Hier ist eine Übersicht aller verfügbaren Befehle und ihrer Funktionen:')
            .addFields(
                { name: '🗄️ Spind-System (Admin)', value: '`/einlagern` - Legt Items in einen Spieler-Spind\n`/auslagern` - Nimmt Items aus einem Spind heraus\n`/bestand` - Zeigt den Inhalt eines bestimmten Spinds\n`/bestandkomplett` - Rechnet den Inhalt aller Spinde zusammen', inline: false },
                { name: '🏛️ Sonder-Lager', value: '`/sonderlager` - Items in 10ner Lager / Mainlager einlagern, auslagern oder ansehen', inline: false },
                { name: '👷 Arbeiter-System', value: '`/arbeiter` - Trägt einen neuen Arbeiter inkl. Ausweisbild ein\n`/arbeiter_entfernen` - Löscht einen Arbeiter aus der Datenbank\n`/arbeiterliste` - Zeigt alle eingetragenen Arbeiter', inline: false },
                { name: '🏖️ Abmeldungen', value: '`/abmeldung` - Meldet ein Mitglied mit Datum und Grund ab\n`/abgemeldet` - Zeigt eine Übersicht aller aktiven Abmeldungen', inline: false },
                { name: '⚖️ Verwaltung & Sanktionen', value: '`/sanktion` - Stellt eine offizielle Sanktion mit Zahlungsfrist aus\n`/verwaltung` - Postet die Team-Verwaltungsübersicht', inline: false },
                { name: '🌐 Server & Allgemein', value: '`/online` - Zeigt die aktuell verbundenen Spieler auf dem FiveM Server\n`/befehle` - Zeigt dieses Menü an', inline: false }
            )
            .setFooter({ text: `Angefordert von ${interaction.member.displayName}` })
            .setTimestamp();

        await interaction.reply({ embeds: [befehleEmbed], ephemeral: true });
    }

    // ==========================================
    // FIVEM SERVER STATUS BEFEHL
    // ==========================================
    if (cmd === 'online') {
        if (!isCreator && !interaction.member.roles.cache.has('1393797458366042205')) {
            return interaction.reply({ content: '❌ Du hast keine Berechtigung für diesen Befehl.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true }); 

        try {
            const response = await axios.get('https://servers-frontend.fivem.net/api/servers/single/lvmkrv', {
                headers: { 'User-Agent': 'Mozilla/5.0' } 
            });
            
            const serverData = response.data.Data;
            
            if (!serverData) {
                return interaction.editReply({ content: '❌ Der Server wurde nicht gefunden oder ist offline.' });
            }

            const clients = serverData.clients || 0;
            const maxClients = serverData.sv_maxclients || 0;
            const players = serverData.players || [];
            
            let playerListText = "";
            if (players.length > 0) {
                const vindictaPlayers = players.filter(p => p.name.toLowerCase().includes('vindicta'));
                const otherPlayers = players.filter(p => !p.name.toLowerCase().includes('vindicta'));

                vindictaPlayers.sort((a, b) => a.name.localeCompare(b.name));
                otherPlayers.sort((a, b) => a.name.localeCompare(b.name));

                const sortedPlayers = [...vindictaPlayers, ...otherPlayers];

                playerListText = sortedPlayers.map(p => {
                    if (p.name.toLowerCase().includes('vindicta')) {
                        return `• **${p.name}** 👑`; 
                    }
                    return `• ${p.name}`;
                }).join('\n');
                
                if (playerListText.length > 3500) {
                    playerListText = playerListText.substring(0, 3500) + '\n\n*...und weitere Spieler*';
                }
            } else if (clients > 0) {
                playerListText = '*Die Spielerliste wird vom Server aus Datenschutzgründen versteckt.*';
            } else {
                playerListText = '*Aktuell ist niemand online.*';
            }

            const onlineEmbed = new EmbedBuilder()
                .setColor('#C0C0C0') 
                .setTitle('🌐 FiveM Server Status')
                .addFields(
                    { name: '📊 Spieler Online', value: `**${clients}** / ${maxClients}`, inline: true },
                    { name: '🔌 Verbinden (F8)', value: '`connect cfx.re/join/lvmkrv`', inline: true },
                    { name: '👥 Spielerliste', value: playerListText, inline: false }
                )
                .setTimestamp();

            await interaction.user.send({ embeds: [onlineEmbed] });
            await interaction.editReply({ content: '✅ Ich habe dir die Server-Liste per privater Nachricht (DM) gesendet!' });

        } catch (error) {
            console.error("Fehler bei der FiveM API Abfrage:", error);
            if (error.code === 50007) {
                return interaction.editReply({ content: '❌ Ich kann dir keine Nachricht schicken. Bitte erlaube Direktnachrichten in deinen Server-Datenschutzeinstellungen!' });
            }
            await interaction.editReply({ content: '❌ Der Server ist aktuell nicht erreichbar oder die Abfrage wurde blockiert.' });
        }
    }

    // ==========================================
    // SONDER-LAGER BEFEHL (Rolle: 1393797458366042205)
    // ==========================================
    if (cmd === 'sonderlager') {
        if (!isCreator && !interaction.member.roles.cache.has('1393797458366042205')) {
            return interaction.reply({ content: '❌ Du hast keine Berechtigung für das Sonder-Lager.', ephemeral: true });
        }

        await interaction.deferReply();

        const aktion = interaction.options.getString('aktion');
        const lager = interaction.options.getString('lager');
        const item = interaction.options.getString('item');
        const anzahl = interaction.options.getInteger('anzahl');
        const executorName = interaction.member.displayName;
        
        const displayName = lager === '10ner_Lager' ? '10ner Lager' : 'Mainlager';
        const docRef = db.collection("lockers").doc(lager);

        if (aktion === 'bestand') {
            try {
                const doc = await docRef.get();
                if (!doc.exists) return interaction.editReply({ content: `🏛️ Das **${displayName}** ist aktuell leer.` });

                const items = doc.data().items || {};
                let bestandText = `🏛️ **Bestand im ${displayName}:**\n\n`;
                let hasItems = false;

                for (const [itemName, amount] of Object.entries(items)) {
                    if (amount > 0) { bestandText += `📦 **${amount}x** ${itemName}\n`; hasItems = true; }
                }
                if (!hasItems) bestandText = `🏛️ Das **${displayName}** ist komplett leer.`;
                
                return interaction.editReply({ content: bestandText });
            } catch (error) {
                return interaction.editReply({ content: '❌ Datenbank Fehler beim Abrufen des Sonder-Lagers.' });
            }
        } else {
            // Einlagern oder Auslagern
            if (!item || !anzahl || anzahl <= 0) {
                return interaction.editReply({ content: '❌ Fehler: Bitte gib ein Item und eine Anzahl größer als 0 an, um einzulagern oder auszulagern.' });
            }

            try {
                const newAmount = await db.runTransaction(async (t) => {
                    const doc = await t.get(docRef);
                    let items = doc.exists ? doc.data().items || {} : {};
                    let currentAmount = items[item] || 0;
                    let updatedAmount = aktion === 'einlagern' ? currentAmount + anzahl : Math.max(0, currentAmount - anzahl);
                    items[item] = updatedAmount;
                    t.set(docRef, { items: items }, { merge: true });
                    return updatedAmount; 
                });

                let actText = aktion === 'einlagern' ? 'eingelagert' : 'entnommen';
                await db.collection("logs").add({
                    user: executorName, action: `Discord Bot (Sonder-Lager)`,
                    details: `${anzahl}x ${item} im ${displayName} ${actText}.`,
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });

                const emoji = aktion === 'einlagern' ? '📥' : '📤';
                let replyText = `${emoji} Erfolgreich **${anzahl}x ${item}** im **${displayName}** ${actText}.\n📦 **Neuer Bestand:** ${newAmount}x`;
                if (aktion === 'auslagern' && newAmount === 0) replyText += ` *(Hinweis: Evtl. nicht genug Items vorhanden).*`;
                
                await interaction.editReply({ content: replyText });
            } catch (error) {
                await interaction.editReply({ content: '❌ Datenbank-Fehler beim Bearbeiten des Sonder-Lagers.' });
            }
        }
    }

    // ==========================================
    // SPIND BEFEHLE (Rolle: 1393797458366042205)
    // ==========================================
    if (['einlagern', 'auslagern', 'bestand', 'bestandkomplett'].includes(cmd)) {
        if (!isCreator && !interaction.member.roles.cache.has('1393797458366042205')) {
            return interaction.reply({ content: '❌ Du hast keine Berechtigung für diesen Spind-Befehl.', ephemeral: true });
        }

        await interaction.deferReply();

        if (cmd === 'einlagern' || cmd === 'auslagern') {
            const targetMember = interaction.options.getMember('mitglied');
            const item = interaction.options.getString('item');
            const anzahl = interaction.options.getInteger('anzahl');

            if (!targetMember) return interaction.editReply({ content: '❌ Mitglied nicht gefunden.' });
            if (anzahl <= 0) return interaction.editReply({ content: '❌ Anzahl muss > 0 sein.' });

            const targetName = targetMember.displayName;
            const executorName = interaction.member.displayName;
            const docRef = db.collection("lockers").doc(targetName);

            try {
                const newAmount = await db.runTransaction(async (t) => {
                    const doc = await t.get(docRef);
                    let items = doc.exists ? doc.data().items || {} : {};
                    let currentAmount = items[item] || 0;
                    let updatedAmount = cmd === 'einlagern' ? currentAmount + anzahl : Math.max(0, currentAmount - anzahl);
                    items[item] = updatedAmount;
                    t.set(docRef, { items: items }, { merge: true });
                    return updatedAmount; 
                });

                let actText = cmd === 'einlagern' ? 'eingelagert' : 'entnommen';
                await db.collection("logs").add({
                    user: executorName, action: `Discord Bot (/${cmd})`,
                    details: `${anzahl}x ${item} bei ${targetName} ${actText}.`,
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });

                const emoji = cmd === 'einlagern' ? '📥' : '📤';
                let replyText = `${emoji} Erfolgreich **${anzahl}x ${item}** beim Spind von **${targetName}** ${actText}.\n📦 **Neuer Bestand:** ${newAmount}x`;
                if (cmd === 'auslagern' && newAmount === 0) replyText += ` *(Hinweis: Evtl. nicht genug Items vorhanden).*`;
                
                await interaction.editReply({ content: replyText });
            } catch (error) {
                await interaction.editReply({ content: '❌ Datenbank-Fehler.' });
            }
        } 
        
        else if (cmd === 'bestand') {
            const targetMember = interaction.options.getMember('mitglied');
            if (!targetMember) return interaction.editReply({ content: '❌ Mitglied nicht gefunden.' });

            const targetName = targetMember.displayName;
            try {
                const doc = await db.collection("lockers").doc(targetName).get();
                if (!doc.exists) return interaction.editReply({ content: `🗄️ Der Spind von **${targetName}** ist leer.` });

                const items = doc.data().items || {};
                let bestandText = `🗄️ **Spind-Bestand von ${targetName}:**\n\n`;
                let hasItems = false;

                for (const [itemName, amount] of Object.entries(items)) {
                    if (amount > 0) { bestandText += `📦 **${amount}x** ${itemName}\n`; hasItems = true; }
                }
                if (!hasItems) bestandText = `🗄️ Der Spind von **${targetName}** ist komplett leer.`;
                
                await interaction.editReply({ content: bestandText });
            } catch (error) {
                await interaction.editReply({ content: '❌ Datenbank Fehler.' });
            }
        }

        else if (cmd === 'bestandkomplett') {
            try {
                const snapshot = await db.collection("lockers").get();
                if (snapshot.empty) return interaction.editReply({ content: '🗄️ Keine Gegenstände registriert.' });

                let totals = {};
                snapshot.forEach(doc => {
                    // Verhindert, dass die Sonder-Lager zum Spieler-Bestand dazugerechnet werden!
                    if (doc.id === '10ner_Lager' || doc.id === 'Mainlager') return;

                    const items = doc.data().items || {};
                    for (const [itemName, amount] of Object.entries(items)) {
                        if (amount > 0) totals[itemName] = (totals[itemName] || 0) + amount;
                    }
                });

                let replyText = `📊 **Gesamter Fraktions-Bestand aller Spieler-Spinde (Zusammengerechnet):**\n\n`;
                let hasItems = false;
                for (const [itemName, amount] of Object.entries(totals)) {
                    if (amount > 0) { replyText += `📦 **${amount}x** ${itemName}\n`; hasItems = true; }
                }
                if (!hasItems) replyText = `🗄️ Alle Spinde leer.`;
                
                await interaction.editReply({ content: replyText });
            } catch (error) {
                await interaction.editReply({ content: '❌ Datenbank Fehler.' });
            }
        }
    }

    // ==========================================
    // SANKTION BEFEHL (Rolle: 1500290272276381716)
    // ==========================================
    if (cmd === 'sanktion') {
        if (!isCreator && !interaction.member.roles.cache.has('1500290272276381716')) {
            return interaction.reply({ content: '❌ Du hast keine Berechtigung, Sanktionen auszustellen.', ephemeral: true });
        }

        const targetMember = interaction.options.getMember('mitglied');
        const grund = interaction.options.getString('grund');
        const betrag = interaction.options.getInteger('betrag');
        const datum = interaction.options.getString('datum');

        if (!targetMember) return interaction.reply({ content: '❌ Mitglied nicht gefunden.', ephemeral: true });

        const sanktionEmbed = new EmbedBuilder()
            .setColor('#808080')
            .setTitle('⚖️ Fraktions-Sanktion')
            .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '👤 Mitglied', value: `<@${targetMember.id}>`, inline: true },
                { name: '💰 Betrag', value: `${betrag.toLocaleString('de-DE')} €`, inline: true },
                { name: '📅 Zahlbar bis', value: datum, inline: false },
                { name: '📝 Grund', value: grund, inline: false },
                { name: '🏦 Zahlung an', value: `Bitte den Betrag zeitnah an die <@&1500290272276381716> zahlen!`, inline: false }
            )
            .setFooter({ text: `Ausgestellt von ${interaction.member.displayName}` })
            .setTimestamp();

        interaction.reply({ embeds: [sanktionEmbed] });
    }

    // ==========================================
    // ABMELDUNG BEFEHLE (Rolle: 1365489886022467705)
    // ==========================================
    if (cmd === 'abmeldung') {
        if (!isCreator && !interaction.member.roles.cache.has('1365489886022467705')) {
            return interaction.reply({ content: '❌ Du hast keine Berechtigung für Abmeldungen.', ephemeral: true });
        }

        const targetMember = interaction.options.getMember('mitglied');
        const grund = interaction.options.getString('grund');
        const bisWann = interaction.options.getString('bis_wann');

        const dateRegex = /^(\d{2})\.(\d{2})\.(\d{4})$/;
        const match = bisWann.match(dateRegex);
        
        if (!match) {
            return interaction.reply({ content: '❌ **Fehler:** Bitte das Datum exakt im Format `TT.MM.JJJJ` eingeben (z.B. `24.12.2026`). Sonst funktioniert die Automatik nicht!', ephemeral: true });
        }

        const parsedDate = new Date(`${match[3]}-${match[2]}-${match[1]}T23:59:59`);
        const untilTimestamp = parsedDate.getTime();

        const abmeldungEmbed = new EmbedBuilder()
            .setColor('#FFFFFF')
            .setTitle('🏖️ Neue Abmeldung')
            .addFields(
                { name: '👤 Mitglied', value: `<@${targetMember.id}>`, inline: true },
                { name: '📅 Bis einschließlich', value: bisWann, inline: true },
                { name: '📝 Grund', value: grund, inline: false }
            )
            .setFooter({ text: 'Status: 🟡 Aktiv' });

        const reply = await interaction.reply({ embeds: [abmeldungEmbed], fetchReply: true });

        await db.collection('abmeldungen').add({
            userId: targetMember.id,
            userName: targetMember.displayName,
            reason: grund,
            untilDateString: bisWann,
            untilTimestamp: untilTimestamp,
            messageId: reply.id,
            channelId: interaction.channelId
        });
    }

    if (cmd === 'abgemeldet') {
        if (!isCreator && !interaction.member.roles.cache.has('1365489886022467705') && !interaction.member.roles.cache.has('1500290272276381716')) {
            return interaction.reply({ content: '❌ Du hast keine Berechtigung.', ephemeral: true });
        }

        try {
            const snapshot = await db.collection('abmeldungen').orderBy('untilTimestamp', 'asc').get();
            
            if (snapshot.empty) {
                return interaction.reply({ content: '✅ Aktuell ist niemand abgemeldet.' });
            }

            const listEmbed = new EmbedBuilder()
                .setColor('#C0C0C0')
                .setTitle('📋 Aktuelle Abmeldungen');

            let count = 0;
            snapshot.forEach(doc => {
                const data = doc.data();
                listEmbed.addFields({ 
                    name: `👤 ${data.userName}`, 
                    value: `Bis: **${data.untilDateString}**\nGrund: *${data.reason}*` 
                });
                count++;
            });

            listEmbed.setDescription(`Es sind aktuell **${count}** Mitglieder abgemeldet.`);
            interaction.reply({ embeds: [listEmbed] });

        } catch (error) {
            console.error("Fehler bei /abgemeldet:", error);
            interaction.reply({ content: '❌ Datenbank Fehler.', ephemeral: true });
        }
    }

    // ==========================================
    // VERWALTUNG BEFEHL (Rolle: 1393797458366042205)
    // ==========================================
    if (cmd === 'verwaltung') {
        if (!isCreator && !interaction.member.roles.cache.has('1393797458366042205')) {
            return interaction.reply({ content: '❌ Du hast keine Berechtigung für diesen Befehl.', ephemeral: true });
        }

        const targetChannelId = '1385576279138500618';
        const targetChannel = interaction.guild.channels.cache.get(targetChannelId);

        if (!targetChannel) {
            return interaction.reply({ content: `❌ Konnte den Ziel-Channel (<#${targetChannelId}>) nicht finden.`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true }); 

        try {
            await interaction.guild.members.fetch();

            const rolesToList = [
                '1505001694155640945',
                '1394457300693024838',
                '1500290272276381716',
                '1500290554947309730',
                '1499020589057314837'
            ];

            const embed = new EmbedBuilder()
                .setColor('#C0C0C0')
                .setTitle('📋 Team-Übersicht: Verwaltung')
                .setDescription('Hier ist die aktuelle Auflistung der Verwaltungs-Mitglieder:')
                .setImage('https://cdn.discordapp.com/attachments/946785663360049183/1504525109988167751/050213-ezgif.com-video-to-gif-converter.gif?ex=6a0beaf2&is=6a0a9972&hm=d182cc1330c0d6630d707c20b80decefe3a9fb50c6fd5810526973f356f7c96f&');

            for (const roleId of rolesToList) {
                const role = interaction.guild.roles.cache.get(roleId);
                if (role) {
                    const membersWithRole = role.members;
                    let memberList = membersWithRole.size > 0 
                        ? membersWithRole.map(m => `> <@${m.id}>`).join('\n') 
                        : '> *Niemand hat diese Rolle*';
                    
                    embed.addFields({
                        name: '\u200B', 
                        value: `<@&${roleId}>\n${memberList}`,
                        inline: false
                    });
                }
            }

            await targetChannel.send({ embeds: [embed] });
            await interaction.editReply({ content: `✅ Die Verwaltungs-Übersicht wurde erfolgreich in <#${targetChannelId}> gesendet.` });

        } catch (error) {
            console.error("Fehler beim Erstellen der Verwaltungs-Übersicht:", error);
            await interaction.editReply({ content: '❌ Es gab einen Fehler beim Senden der Nachricht.' });
        }
    }

    // ==========================================
    // ARBEITER BEFEHLE
    // ==========================================
    if (cmd === 'arbeiter') {
        const vomWem = interaction.options.getMember('vom_wem');
        const arbeiterName = interaction.options.getString('name');
        const ausweis = interaction.options.getAttachment('ausweis');
        const telefonnummer = interaction.options.getString('telefonnummer') || 'Nicht angegeben';

        if (!vomWem) return interaction.reply({ content: '❌ Mitglied (Vom wem) nicht gefunden.', ephemeral: true });

        if (!ausweis.contentType || !ausweis.contentType.startsWith('image/')) {
            return interaction.reply({ content: '❌ Bitte lade eine gültige Bilddatei für den Ausweis hoch!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor('#F1C40F') 
            .setTitle('👷 Neuer Arbeiter Eingetragen')
            .addFields(
                { name: '👤 Eingestellt von', value: `<@${vomWem.id}>`, inline: true },
                { name: '🛠️ Name des Arbeiters', value: arbeiterName, inline: true },
                { name: '📞 Telefonnummer', value: telefonnummer, inline: false }
            )
            .setImage(ausweis.url)
            .setFooter({ text: `Eingetragen von ${interaction.member.displayName}` })
            .setTimestamp();

        try {
            await db.collection('arbeiter').add({
                vomWemId: vomWem.id,
                arbeiterName: arbeiterName,
                ausweisUrl: ausweis.url,
                telefonnummer: telefonnummer,
                eingetragenVon: interaction.user.id,
                timestamp: Date.now()
            });
            
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error("Fehler beim Speichern des Arbeiters:", error);
            await interaction.reply({ content: '❌ Fehler beim Speichern in der Datenbank.', ephemeral: true });
        }
    }

    if (cmd === 'arbeiter_entfernen') {
        const arbeiterName = interaction.options.getString('name');
        await interaction.deferReply();

        try {
            const snapshot = await db.collection('arbeiter').where('arbeiterName', '==', arbeiterName).get();
            
            if (snapshot.empty) {
                return interaction.editReply({ content: `❌ Konnte keinen Arbeiter mit dem Namen **${arbeiterName}** finden.` });
            }

            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();

            const embed = new EmbedBuilder()
                .setColor('#E74C3C') 
                .setTitle('🛑 Arbeiter Ausgetragen')
                .setDescription(`Der Arbeiter **${arbeiterName}** wurde erfolgreich entlassen / ausgetragen.`)
                .setFooter({ text: `Ausgetragen von ${interaction.member.displayName}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("Fehler beim Löschen des Arbeiters:", error);
            await interaction.editReply({ content: '❌ Datenbank Fehler beim Austragen.' });
        }
    }

    if (cmd === 'arbeiterliste') {
        await interaction.deferReply();

        try {
            const snapshot = await db.collection('arbeiter').orderBy('timestamp', 'desc').get();
            
            if (snapshot.empty) {
                return interaction.editReply({ content: '✅ Es sind aktuell keine Arbeiter eingetragen.' });
            }

            const listEmbed = new EmbedBuilder()
                .setColor('#C0C0C0')
                .setTitle('📋 Aktive Arbeiterliste');

            let listText = "";
            let count = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                const tel = data.telefonnummer ? data.telefonnummer : 'Keine Nummer';
                listText += `• **${data.arbeiterName}** [📞 ${tel}] *(Eingestellt von: <@${data.vomWemId}>)*\n`;
                count++;
            });

            listEmbed.setDescription(listText);
            listEmbed.setFooter({ text: `Insgesamt ${count} aktive Arbeiter` });

            await interaction.editReply({ embeds: [listEmbed] });
        } catch (error) {
            console.error("Fehler bei /arbeiterliste:", error);
            await interaction.editReply({ content: '❌ Datenbank Fehler beim Abrufen der Arbeiterliste.' });
        }
    }
}); 

// ==========================================
// AUTO-CHECK FÜR ABGELAUFENE ABMELDUNGEN
// ==========================================
async function checkAbmeldungen() {
    try {
        const now = Date.now();
        const snapshot = await db.collection('abmeldungen').where('untilTimestamp', '<', now).get();
        
        snapshot.forEach(async doc => {
            const data = doc.data();
            try {
                const channel = await client.channels.fetch(data.channelId);
                if (channel) {
                    const msg = await channel.messages.fetch(data.messageId);
                    if (msg && msg.embeds.length > 0) {
                        const oldEmbed = EmbedBuilder.from(msg.embeds[0]);
                        oldEmbed.setColor('#2F3136'); 
                        oldEmbed.setTitle('✅ Abmeldung Beendet');
                        oldEmbed.setFooter({ text: 'Status: 🟢 Wieder da' });
                        
                        await msg.edit({ embeds: [oldEmbed] });
                    }
                }
            } catch(e) {
                console.log(`Konnte Nachricht für abgelaufene Abmeldung nicht updaten: ${e.message}`);
            }
            await db.collection('abmeldungen').doc(doc.id).delete();
        });
    } catch (error) {
        console.error("Fehler im Abmeldungs-Checker:", error);
    }
}

setInterval(checkAbmeldungen, 30 * 60 * 1000);

// ==========================================
// WILLKOMMEN & VERLASSEN EVENTS
// ==========================================

client.on('guildMemberAdd', async member => {
    const welcomeChannelId = '1494060969578598512'; 
    const channel = member.guild.channels.cache.get(welcomeChannelId);
    if (!channel) return;

    const joinedUnix = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
    const createdUnix = member.user.createdTimestamp ? Math.floor(member.user.createdTimestamp / 1000) : null;

    let statsText = "\n\n**User-Stats:**\n";
    statsText += `> 📥 Gejoint: ${joinedUnix ? `<t:${joinedUnix}:F> (<t:${joinedUnix}:R>)` : 'Unbekannt'}\n`;
    statsText += `> 📅 Account erstellt: ${createdUnix ? `<t:${createdUnix}:F> (<t:${createdUnix}:R>)` : 'Unbekannt'}`;

    const bannerEmbed = new EmbedBuilder()
        .setColor('#FFFFFF') 
        .setImage('https://cdn.discordapp.com/attachments/946785663360049183/1505732015272759429/image.png?ex=6a0bb1b7&is=6a0a6037&hm=da349e511e00103f31399c7d779ed5c160bdaded95a7955791ec0848e860568f&')
        .setURL('https://vindicta.com');

    const textEmbed = new EmbedBuilder()
        .setColor('#FFFFFF') 
        .setDescription(`👋 **Willkommen** <@${member.id}>` + statsText)
        .setURL('https://vindicta.com');

    channel.send({ embeds: [bannerEmbed, textEmbed] }).catch(console.error);
});

client.on('guildMemberRemove', async member => {
    const leaveChannelId = '1493332791574925392'; 
    const channel = member.guild.channels.cache.get(leaveChannelId);
    if (!channel) return;

    const userName = member.nickname || member.user.globalName || member.user.username;

    const leftUnix = Math.floor(Date.now() / 1000);
    const createdUnix = member.user.createdTimestamp ? Math.floor(member.user.createdTimestamp / 1000) : null;

    let statsText = "\n\n**User-Stats:**\n";
    statsText += `> 📤 Verlassen: <t:${leftUnix}:F> (<t:${leftUnix}:R>)\n`;
    statsText += `> 📅 Account erstellt: ${createdUnix ? `<t:${createdUnix}:F> (<t:${createdUnix}:R>)` : 'Unbekannt'}`;

    const bannerEmbed = new EmbedBuilder()
        .setColor('#444444') 
        .setImage('https://cdn.discordapp.com/attachments/946785663360049183/1505732048575529151/image.png?ex=6a0bb1bf&is=6a0a603f&hm=8185ea7d37887f3b2874ffd304fce7125d81dd902092aadef48415c689712ff3&')
        .setURL('https://vindicta.com');

    const textEmbed = new EmbedBuilder()
        .setColor('#444444') 
        .setDescription(`👋 **Auf Wiedersehen** **${userName}**` + statsText)
        .setURL('https://vindicta.com');

    channel.send({ embeds: [bannerEmbed, textEmbed] }).catch(console.error);
});

client.login(process.env.BOT_TOKEN);
