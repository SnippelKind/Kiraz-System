const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rang')
        .setDescription('Zeigt eine Liste der Ränge und den jeweiligen Usern an.'),
        
    async execute(interaction) {
        await interaction.deferReply();

        // Alle korrekten IDs wurden eingetragen
        const rolesToDisplay = [
            { id: '1346576630767816869', label: '12 - Patron' },
            { id: '1346576630767816868', label: '11 - Don' },
            { id: '1346576630767816867', label: '10 - Subjefe' },
            { id: '1346576630767816866', label: '09 - Jefe de Plaza' },
            { id: '1346576630751035542', label: '08 - Capitano' },
            { id: '1346576630751035541', label: '07 - Teniente' },
            { id: '1346576630751035540', label: '06 - Cobratore' },
            { id: '1346576630751035539', label: '05 - Camello' },
            { id: '1346576630751035538', label: '04 - Sicario' },
            { id: '1346576630751035537', label: '03 - Soldado' },
            { id: '1346576630751035536', label: '02 - Reculta' },
            { id: '1393759494722293850', label: '01 - Novato' }
        ];

        await interaction.guild.members.fetch();

        let description = '';

        for (const roleConfig of rolesToDisplay) {
            const role = interaction.guild.roles.cache.get(roleConfig.id);
            
            if (role) {
                const members = role.members.map(m => m.user.toString());
                const memberList = members.length > 0 ? members.join('\n') : '*Niemand*';
                description += `**${roleConfig.label}**\n${memberList}\n\n`;
            } else {
                description += `**${roleConfig.label}**\n*Rolle nicht gefunden*\n\n`;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('Fraktions-Ränge')
            .setDescription(description)
            .setColor('#000000') 
            .setTimestamp()
            .setFooter({ text: 'Rangliste', iconURL: interaction.guild.iconURL() });

        await interaction.editReply({ embeds: [embed] });
    },
};
