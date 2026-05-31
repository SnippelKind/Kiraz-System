const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rang')
        .setDescription('Zeigt eine Liste der Ränge und den jeweiligen Usern an.'),
        
    async execute(interaction) {
        // Wir verzögern die Antwort kurz, falls der Server viele Mitglieder hat und das Fetchen dauert
        await interaction.deferReply();

        // HIER DEINE ROLLEN-IDS EINTRAGEN
        // Die Reihenfolge im Array bestimmt die Reihenfolge im Embed
        const rolesToDisplay = [
            { id: '1346576630767816869', label: '12 - Patron' },
            { id: '1346576630767816868', label: '11 - Don' },
            { id: '1346576630767816868', label: '10 - Subjefe' },
            { id: '1346576630767816868', label: '09 - Jefe de Plaza' },
            { id: '1346576630767816868', label: '08 - Capitano' },
            { id: '1346576630767816868', label: '07 - Teniente' },
            { id: '1346576630767816868', label: '06 - Cobratore' },
            { id: '1346576630767816868', label: '05 - Camello' },
            { id: '1346576630767816868', label: '04 - Sicario' },
            { id: '1346576630767816868', label: '03 - Soldado' },
            { id: '1346576630767816868', label: '02 - Reculta' },
            { id: '1346576630767816868', label: '01 - Novato' }


            // Füge hier beliebig viele weitere Ränge nach dem gleichen Muster hinzu
        ];

        // Fetche alle Member, damit der Cache vollständig ist
        await interaction.guild.members.fetch();

        let description = '';

        // Gehe alle konfigurierten Rollen durch
        for (const roleConfig of rolesToDisplay) {
            const role = interaction.guild.roles.cache.get(roleConfig.id);
            
            if (role) {
                // Sammle alle User mit dieser Rolle (als Erwähnung)
                const members = role.members.map(m => m.user.toString());
                
                // Falls User die Rolle haben, liste sie auf, ansonsten schreibe "Niemand"
                const memberList = members.length > 0 ? members.join('\n') : '*Niemand*';

                // Formatierung: Rollenname, User, leere Zeile (\n\n)
                description += `**${roleConfig.label}**\n${memberList}\n\n`;
            } else {
                // Fallback, falls eine Rollen-ID falsch ist
                description += `**${roleConfig.label}**\n*Rolle nicht gefunden*\n\n`;
            }
        }

        // Erstelle das schwarz-weiße Embed
        const embed = new EmbedBuilder()
            .setTitle('Fraktions-Ränge')
            .setDescription(description)
            .setColor('#000000') // Hex-Code für Schwarz
            .setTimestamp()
            .setFooter({ text: 'Rangliste', iconURL: interaction.guild.iconURL() });

        // Sende das Embed ab
        await interaction.editReply({ embeds: [embed] });
    },
};