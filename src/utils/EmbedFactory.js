'use strict';

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class EmbedFactory {
    createMainQueueEmbed(activeTesters) {
        const embed = new EmbedBuilder()
            .setTitle("⚔️ SISTEMA DE TESTES - HEHE TIERS")
            .setColor(0x5865F2)
            .setTimestamp();

        if (activeTesters.size === 0) {
            embed.setDescription("**SEM TESTERS ONLINE NO MOMENTO**\n\nAssim que um tester ativar, a fila aparecerá aqui.");
            return { embed, row: null };
        }

        let desc = "**TESTERS ONLINE:**\n\n";
        const options = [];

        for (const [roleId, data] of activeTesters) {
            const qtd = data.queue.length;
            desc += `🔹 <@&${roleId}> ─ **Modo: ${data.roleName}** ─ ${qtd} na fila\n`;
            options.push({ label: data.roleName, value: roleId, description: `${qtd} jogadores esperando` });
        }

        embed.setDescription(desc);

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_tester')
                .setPlaceholder('Escolha o tester para entrar na fila')
                .addOptions(options)
        );

        return { embed, row };
    }

    createRoundEmbed(gamesense, mms, numRound, totalRounds, isLast = false) {
        const media = (gamesense + mms) / 2;
        const isHigh = gamesense <= 30 && mms <= 30;
        const maxScore = isHigh ? 30 : 20;

        let embed = new EmbedBuilder()
            .setTitle(isHigh ? `⚡ High Round ${numRound} Registrado` : `📊 Round ${numRound} Registrado`)
            .setColor(isLast ? (media >= 19 ? 0xFFD700 : 0xFF4444) : 0x5865F2)
            .addFields(
                { name: '🎯 Noção de Jogo', value: `**${gamesense}/${maxScore}**`, inline: true },
                { name: '⚙️ MMS', value: `**${mms}/${maxScore}**`, inline: true },
                { name: '📈 Média', value: `**${media.toFixed(1)}/${maxScore}**`, inline: true }
            )
            .setFooter({ text: isHigh ? `${numRound}/${totalRounds} rounds registrados — High Test` : `${numRound}/3 rounds registrados` })
            .setTimestamp();

        if (isLast) {
            const mediaTier = media;
            const passou = isHigh ? mediaTier >= 19 : mediaTier >= 18.5;

            embed.addFields(
                { name: '\u200B', value: isHigh ? '━━━━━━━━━━━━━━━━━━━━━━━' : '─────────────────', inline: false },
                { name: isHigh ? '🏆 Média High Tier (MHT)' : '🏆 Média Tier (MT)', value: `**${mediaTier.toFixed(2)}/${maxScore}**`, inline: false },
                { name: '📋 Resumo', value: '', inline: false }
            );

            if (!isHigh) {
                embed.addFields({ name: '\u200B', value: passou ? '🌟 ━━━━━━━━━━━━━━━━━━━━━━━\n✅ **PASSOU EVAL!** Desempenho acima do esperado!\n🌟 ━━━━━━━━━━━━━━━━━━━━━━━' : '🔴 ━━━━━━━━━━━━━━━━━━━━━━━\n❌ **NÃO PASSOU**\n🔴 ━━━━━━━━━━━━━━━━━━━━━━━', inline: false });
            } else {
                embed.addFields({ name: '\u200B', value: passou ? '🌟 ━━━━━━━━━━━━━━━━━━━━━━━\n✅ **PASSOU O HIGH TEST!** Performance incrível!\n🌟 ━━━━━━━━━━━━━━━━━━���━━━━' : '🔴 ━━━━━━━━━━━━━━━━━━━━━━━\n❌ **NÃO PASSOU O HIGH TEST.** Média insuficiente.\n🔴 ━━━━━━━━━━━━━━━━━━━━━━━', inline: false });
            }

            embed.setFooter({ text: isHigh ? `${numRound}/${totalRounds} rounds completos — use /high-result para finalizar` : '3/3 rounds completos — use /result para finalizar' });
        }

        return embed;
    }

    createResultEmbed(target, tierRole, ign, evaluator, canalData, temRounds, isHigh = false) {
        const embed = new EmbedBuilder()
            .setTitle(isHigh ? '⚡ RESULTADO DO HIGH TEST' : '🏆 RESULTADO DO TESTE')
            .setColor(0x00FF00)
            .setDescription(`O ${isHigh ? 'High Test' : 'teste'} de <@${target.id}> foi concluído!`)
            .addFields(
                { name: '👤 Jogador', value: `<@${target.id}>`, inline: true },
                { name: '🎮 IGN', value: `**${ign}**`, inline: true },
                { name: '🏅 Tier', value: `<@&${tierRole.id}>`, inline: true },
                { name: '🛡️ Avaliado por', value: `<@${evaluator.id}>`, inline: false }
            )
            .setThumbnail(target.displayAvatarURL())
            .setTimestamp();

        if (temRounds) {
            const soma = canalData.rounds.reduce((acc, r) => acc + r.media, 0);
            const media = soma / canalData.rounds.length;
            const maxScore = isHigh ? 30 : 20;
            const passou = isHigh ? media >= 19 : media >= 18.5;

            embed.addFields(
                { name: '\u200B', value: isHigh ? '━━━━━━━━━━━━━━━━━━━━━━━' : '─────────────────', inline: false },
                { name: '📋 Rounds', value: canalData.rounds.map((r, i) => `Round ${i+1}: GS ${r.gamesense} | MMS ${r.mms} | Média ${r.media.toFixed(1)}`).join('\n'), inline: false },
                { name: isHigh ? '📊 Média High Tier (MHT)' : '📊 Média Tier (MT)', value: `**${media.toFixed(2)}/${maxScore}**`, inline: false }
            );

            if (passou) {
                embed.addFields({ name: '\u200B', value: '🌟 ━━━━━━━━━━━━━━━━━━━━━━━\n✅ **PASSOU EVAL!** Desempenho acima do esperado!\n🌟 ━━━━━━━━━━━━━━━━━━━━━━━', inline: false });
                embed.setColor(0xFFD700);
            }
        }

        embed.setFooter({ text: `${isHigh ? 'High Test' : 'Resultado'} • ${new Date().toLocaleDateString('pt-BR')}` });

        return embed;
    }

    createBlacklistEmbed(target, evaluator, duracaoTxt, expiresAt, expiresAtTxt) {
        const embed = new EmbedBuilder()
            .setTitle('🚫 BLACKLIST APLICADA')
            .setColor(0xFF0000)
            .setDescription(`<@${target.id}> foi adicionado à blacklist do servidor.`)
            .addFields(
                { name: '👤 Jogador', value: `<@${target.id}>`, inline: true },
                { name: '🛡️ Staff', value: `<@${evaluator.id}>`, inline: true },
                { name: '​', value: '​', inline: true },
                { name: '⏳ Duração', value: duracaoTxt, inline: true },
                { name: '📅 Expira em', value: expiresAtTxt, inline: true }
            )
            .setThumbnail(target.displayAvatarURL())
            .setFooter({ text: `ID: ${target.id}` })
            .setTimestamp();

        return embed;
    }

    createTicketButtons(ticketChannelId) {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fechar_${ticketChannelId}`).setLabel('Fechar Teste').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`result_${ticketChannelId}`).setLabel('Dar Resultado').setStyle(ButtonStyle.Success)
        );
    }

    createTicketEmbed(nextId, role, testerRole, staffId) {
        return new EmbedBuilder()
            .setTitle("⚔️ Teste Iniciado")
            .setDescription(`Bem-vindo <@${nextId}>!\n\n🎮 **Modo:** ${role}\n👤 **Tester:** <@&${testerRole}>\n🛡️ **Staff:** <@${staffId}>`)
            .setColor(0x5865F2)
            .setTimestamp();
    }

    createTesterInactiveEmbed(roleId, roleName) {
        return new EmbedBuilder()
            .setTitle('😴 Tester Inativo — Fila Encerrada')
            .setColor(0xFF6B00)
            .setDescription(`Parece que o tester <@&${roleId}> está offline ou inativo.\n\nA fila **${roleName}** foi encerrada automaticamente para não te deixar esperando à toa.`)
            .addFields({ name: '🔁 O que fazer?', value: 'Fique de olho no servidor — quando uma nova fila for aberta, você será avisado.' })
            .setFooter({ text: 'HEHE TIERS • Sistema Automático' })
            .setTimestamp();
    }
}

module.exports = new EmbedFactory();