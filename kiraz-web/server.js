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
    // SPIND BEFEHLE (Rolle: 1393797458366042205)
    // ==========================================
    if (['einlagern', 'auslagern', 'bestand', 'bestandkomplett'].includes(cmd)) {
        if (!isCreator && !interaction.member.roles.cache.has('1393797458366042205')) {
            return interaction.reply({ content: '❌ Du hast keine Berechtigung für diesen Spind-Befehl.', ephemeral: true });
        }

        // GIBT DEM BOT ZEIT: Erzeugt "Der Bot denkt nach..." und verhindert den 3-Sekunden Timeout Crash!
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
                    const items = doc.data().items || {};
                    for (const [itemName, amount] of Object.entries(items)) {
                        if (amount > 0) totals[itemName] = (totals[itemName] || 0) + amount;
                    }
                });

                let replyText = `📊 **Gesamter Fraktions-Bestand (Zusammengerechnet):**\n\n`;
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
        
        else if (cmd === 'bestand') {
            const targetMember = interaction.options.getMember('mitglied');
            if (!targetMember) return interaction.reply({ content: '❌ Mitglied nicht gefunden.', ephemeral: true });

            const targetName = targetMember.displayName;
            try {
                const doc = await db.collection("lockers").doc(targetName).get();
                if (!doc.exists) return interaction.reply({ content: `🗄️ Der Spind von **${targetName}** ist leer.` });

                const items = doc.data().items || {};
                let bestandText = `🗄️ **Spind-Bestand von ${targetName}:**\n\n`;
                let hasItems = false;

                for (const [itemName, amount] of Object.entries(items)) {
                    if (amount > 0) { bestandText += `📦 **${amount}x** ${itemName}\n`; hasItems = true; }
                }
                if (!hasItems) bestandText = `🗄️ Der Spind von **${targetName}** ist komplett leer.`;
                interaction.reply({ content: bestandText });
            } catch (error) {
                interaction.reply({ content: '❌ Datenbank Fehler.', ephemeral: true });
            }
        }

        else if (cmd === 'bestandkomplett') {
            try {
                const snapshot = await db.collection("lockers").get();
                if (snapshot.empty) return interaction.reply({ content: '🗄️ Keine Gegenstände registriert.' });

                let totals = {};
                snapshot.forEach(doc => {
                    const items = doc.data().items || {};
                    for (const [itemName, amount] of Object.entries(items)) {
                        if (amount > 0) totals[itemName] = (totals[itemName] || 0) + amount;
                    }
                });

                let replyText = `📊 **Gesamter Fraktions-Bestand (Zusammengerechnet):**\n\n`;
                let hasItems = false;
                for (const [itemName, amount] of Object.entries(totals)) {
                    if (amount > 0) { replyText += `📦 **${amount}x** ${itemName}\n`; hasItems = true; }
                }
                if (!hasItems) replyText = `🗄️ Alle Spinde leer.`;
                interaction.reply({ content: replyText });
            } catch (error) {
                interaction.reply({ content: '❌ Datenbank Fehler.', ephemeral: true });
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
            // DESIGN-UPDATE: Mittleres Grau statt Rot
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
            // DESIGN-UPDATE: Reines Weiß statt Gelb
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
                // DESIGN-UPDATE: Hellgrau statt Blau
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
                // HIER IST DIE FARBE: Ein sauberes Silber-Grau statt Grün!
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
                        // DESIGN-UPDATE: Sehr dunkles Grau statt Hellgrün
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

    // Discord Timestamps berechnen
    const joinedUnix = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
    const createdUnix = member.user.createdTimestamp ? Math.floor(member.user.createdTimestamp / 1000) : null;

    let statsText = "\n\n**User-Stats:**\n";
    statsText += `> 📥 Gejoint: ${joinedUnix ? `<t:${joinedUnix}:F> (<t:${joinedUnix}:R>)` : 'Unbekannt'}\n`;
    statsText += `> 📅 Account erstellt: ${createdUnix ? `<t:${createdUnix}:F> (<t:${createdUnix}:R>)` : 'Unbekannt'}`;

    const welcomeEmbed = new EmbedBuilder()
        // DESIGN-UPDATE: Reines Weiß statt Orange
        .setColor('#FFFFFF') 
        .setDescription(`👋 **Willkommen** <@${member.id}>` + statsText)
        .setImage('https://cdn.discordapp.com/attachments/946785663360049183/1505732015272759429/image.png?ex=6a0bb1b7&is=6a0a6037&hm=da349e511e00103f31399c7d779ed5c160bdaded95a7955791ec0848e860568f&');

    channel.send({ embeds: [welcomeEmbed] }).catch(console.error);
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

    const leaveEmbed = new EmbedBuilder()
        // Bereits Dunkelgrau, passt perfekt
        .setColor('#444444') 
        .setDescription(`👋 **Auf Wiedersehen** **${userName}**` + statsText)
        .setImage('https://cdn.discordapp.com/attachments/946785663360049183/1505732048575529151/image.png?ex=6a0bb1bf&is=6a0a603f&hm=8185ea7d37887f3b2874ffd304fce7125d81dd902092aadef48415c689712ff3&');

    channel.send({ embeds: [leaveEmbed] }).catch(console.error);
});

client.login(process.env.BOT_TOKEN);
