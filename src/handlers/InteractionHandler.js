'use strict';

const {
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
} = require('discord.js');

const {
    CATEGORY_TICKETS_ID,
    UNRANKED_ROLE_ID,
    TESTADO_ROLE_ID,
    ALLOWED_ROLE_IDS,
    PING_ROLE_IDS,
    BLACKLIST_ROLE_ID,
    RESULT_LOG_CHANNEL_ID,
    HIGH_RESULT_CHANNEL_ID,
    BLACKLIST_LOG_CHANNEL_ID,
} = require('../config/yaml');

const {
    COOLDOWN_MS,
} = require('../utils/constants');

const PermissionManager = require('../utils/PermissionManager');
const EmbedFactory = require('../utils/EmbedFactory');
const RoundManager = require('../managers/RoundManager');
const QueueManager = require('../managers/QueueManager');
const BlacklistManager = require('../managers/BlacklistManager');

class InteractionHandler {
    constructor() {
        this.mainQueueMessage = null;
    }

    setMainQueueMessage(msg) {
        this.mainQueueMessage = msg;
    }

    getMainQueueMessage() {
        return this.mainQueueMessage;
    }

    async handle(interaction) {
        if (!interaction.guild) return;

        const perm = PermissionManager.canOperate(interaction.member);
        const activeTesters = QueueManager.getActiveTesters();

        if (interaction.isChatInputCommand() && interaction.commandName === 'postar-fila') {
            if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
            const { embed, row } = EmbedFactory.createMainQueueEmbed(activeTesters);
            await interaction.reply({ content: '✅ Embed enviada!', ephemeral: true });
            this.mainQueueMessage = await interaction.channel.send({ embeds: [embed], components: row ? [row] : [] });
        }

        if (interaction.isChatInputCommand() && interaction.commandName === 'ativar-fila') {
            if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
            const role = interaction.options.getRole('cargo');

            let pingMessageId = null;
            let pingChannelId = null;
            try {
                const pingContent = PING_ROLE_IDS.map(id => `<@&${id}>`).join(' ');
                const pingMsg = await interaction.channel.send(`📢 Fila de **${role.name}** ativada! ${pingContent}`);
                pingMessageId = pingMsg.id;
                pingChannelId = interaction.channel.id;
            } catch (err) {
                console.error('Erro ao enviar ping de ativação:', err);
            }

            QueueManager.setTesterActive(role.id, {
                roleName: role.name,
                staffId: interaction.user.id,
                queue: [],
                pingMessageId,
                pingChannelId
            });

            await this.updateMainEmbed();
            QueueManager.startEmptyQueueTimeout(role.id, interaction.client, interaction.guild);
            await interaction.reply({ content: `✅ Tester <@&${role.id}> ativado!`, ephemeral: true });
        }

        if (interaction.isChatInputCommand() && interaction.commandName === 'desativar-fila') {
            if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
            const role = interaction.options.getRole('cargo');

            if (role) {
                if (!QueueManager.isTesterActive(role.id)) return interaction.reply({ content: "❌ Cargo não está ativo.", ephemeral: true });

                const data = QueueManager.getTesterData(role.id);

                if (data.pingMessageId && data.pingChannelId) {
                    try {
                        const ch = await interaction.guild.channels.fetch(data.pingChannelId);
                        const msg = await ch.messages.fetch(data.pingMessageId);
                        await msg.delete();
                    } catch (err) {
                        console.error('Erro ao apagar mensagem de ping:', err.message);
                    }
                }

                QueueManager.shutdown(role.id);
                QueueManager.removeTester(role.id);
            } else {
                for (const [roleId, data] of activeTesters) {
                    if (data.pingMessageId && data.pingChannelId) {
                        try {
                            const ch = await interaction.guild.channels.fetch(data.pingChannelId);
                            const msg = await ch.messages.fetch(data.pingMessageId);
                            await msg.delete();
                        } catch {}
                    }
                    QueueManager.shutdown(roleId);
                }
                QueueManager.clearAllTesters();
            }

            await this.updateMainEmbed();
            await interaction.reply({ content: role ? `✅ Tester <@&${role.id}> desativado.` : "✅ Todos desativados.", ephemeral: true });
        }

        if (interaction.isChatInputCommand() && interaction.commandName === 'leave') {
            const role = interaction.options.getRole('cargo');
            if (!QueueManager.isTesterActive(role.id)) return interaction.reply({ content: "❌ Esse tester não está ativo.", ephemeral: true });
            const data = QueueManager.getTesterData(role.id);
            const idx = data.queue.indexOf(interaction.user.id);
            if (idx === -1) return interaction.reply({ content: "❌ Você não está nessa fila.", ephemeral: true });
            const wasFirst = idx === 0;
            QueueManager.removeFromQueue(role.id, interaction.user.id);
            await this.updateMainEmbed();

            if (wasFirst && data.queue.length > 0) {
                QueueManager.startQueueNotify(role.id, interaction.client);
            } else if (data.queue.length === 0) {
                QueueManager.stopQueueNotify(role.id);
                QueueManager.cancelTesterActivityTimeout(role.id);
                QueueManager.startEmptyQueueTimeout(role.id, interaction.client, interaction.guild);
            }

            await interaction.reply({ content: `✅ Você saiu da fila de **${data.roleName}**.`, ephemeral: true });
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'select_tester') {
            const roleId = interaction.values[0];
            if (!QueueManager.isTesterActive(roleId)) return interaction.reply({ content: "Tester não está mais ativo.", ephemeral: true });

            if (BlacklistManager.has(interaction.user.id)) {
                const entry = BlacklistManager.get(interaction.user.id);
                const expiraTxt = entry.expiresAt
                    ? `Expira em <t:${Math.floor(entry.expiresAt / 1000)}:R>.`
                    : 'Sua blacklist é permanente.';
                return interaction.reply({ content: `🚫 Você está na blacklist e não pode entrar em nenhuma fila. ${expiraTxt}`, ephemeral: true });
            }

            const cooldownKey = `${interaction.user.id}:${roleId}`;
            const now = Date.now();

            if (interaction.client.cooldowns && interaction.client.cooldowns.has(cooldownKey)) {
                const available = interaction.client.cooldowns.get(cooldownKey);
                if (now < available) {
                    const dias = Math.ceil((available - now) / (1000 * 60 * 60 * 24));
                    return interaction.reply({ content: `⏳ Você precisa aguardar **${dias} dia(s)** para entrar nessa fila novamente.`, ephemeral: true });
                }
            }

            const data = QueueManager.getTesterData(roleId);

            if (data.queue.includes(interaction.user.id)) {
                return interaction.reply({ content: "❌ Você já está nessa fila!", ephemeral: true });
            }

            const wasEmpty = data.queue.length === 0;
            QueueManager.addToQueue(roleId, interaction.user.id);
            await this.updateMainEmbed();
            QueueManager.cancelEmptyQueueTimeout(roleId);

            try {
                const member = await interaction.guild.members.fetch(interaction.user.id);
                await member.roles.add(UNRANKED_ROLE_ID);
            } catch (err) {
                console.error('Erro ao dar unranked:', err);
            }

            if (wasEmpty) {
                QueueManager.startQueueNotify(roleId, interaction.client);
                QueueManager.startTesterActivityTimeout(roleId, interaction.client, interaction.guild);
            }

            await interaction.reply({ content: `✅ Você entrou na fila de **${data.roleName}**! Use \`/leave\` caso queira sair.`, ephemeral: true });
        }

        if (interaction.isChatInputCommand() && interaction.commandName === 'next') {
            if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });

            const role = interaction.options.getRole('cargo');
            if (!QueueManager.isTesterActive(role.id)) return interaction.reply({ content: "Tester não encontrado.", ephemeral: true });

            const data = QueueManager.getTesterData(role.id);
            if (data.queue.length === 0) return interaction.reply({ content: "Fila vazia!", ephemeral: true });

            await interaction.deferReply({ ephemeral: true });

            const nextId = data.queue[0];
            const player = await interaction.client.users.fetch(nextId);

            // TODO: e um horror isso aqui plmds
            let parentId = CATEGORY_TICKETS_ID;
            if (parentId) {
                const parentChannel = await interaction.guild.channels.fetch(parentId).catch(() => null);
                if (!parentChannel || parentChannel.type !== ChannelType.GuildCategory) {
                    console.log(`[!] CATEGORY_TICKETS_ID ${parentId} nao e uma categoria valida, criando canal sem categoria...`);
                    parentId = null;
                }
            }

            let ticketChannel;
            try {
                ticketChannel = await interaction.guild.channels.create({
                    name: `teste-${player.username}`,
                    type: ChannelType.GuildText,
                    parent: parentId,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: nextId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                        ...ALLOWED_ROLE_IDS.map(id => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] })),
                        { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    ]
                });
            } catch (err) {
                console.error('Erro ao criar canal de teste:', err);
                return interaction.followUp({ content: "❌ Erro ao criar o canal de teste. Tente novamente.", ephemeral: true });
            }

            data.queue.shift();
            await this.updateMainEmbed();

            QueueManager.refreshTesterActivity(role.id, interaction.guild);

            if (data.queue.length > 0) {
                QueueManager.startQueueNotify(role.id, interaction.client);
            } else {
                QueueManager.stopQueueNotify(role.id);
                QueueManager.cancelTesterActivityTimeout(role.id);
            }

            RoundManager.setRoundData(ticketChannel.id, { rounds: [], playerId: nextId, roleId: role.id, lastActivity: Date.now() });

            const btnRow = EmbedFactory.createTicketButtons(ticketChannel.id);
            const embed = EmbedFactory.createTicketEmbed(nextId, data.roleName, role.id, data.staffId);

            await ticketChannel.send({
                content: `<@${nextId}> | <@&${role.id}> | <@&${UNRANKED_ROLE_ID}> | <@&${TESTADO_ROLE_ID}>`,
                embeds: [embed],
                components: [btnRow]
            });

            await interaction.followUp({ content: `�� Canal criado: ${ticketChannel}`, ephemeral: true });
        }

        if (interaction.isChatInputCommand() && interaction.commandName === 'round') {
            if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
            if (!interaction.channel.name?.startsWith('teste-')) {
                return interaction.reply({ content: "❌ Este comando só pode ser usado em canais de teste.", ephemeral: true });
            }

            const canalRound = RoundManager.getRoundData(interaction.channel.id);
            if (canalRound?.roleId) {
                QueueManager.refreshTesterActivity(canalRound.roleId, interaction.guild);
            }

            if (!RoundManager.getRoundData(interaction.channel.id)) {
                RoundManager.setRoundData(interaction.channel.id, { rounds: [], playerId: null, roleId: null, lastActivity: Date.now() });
            }

            const canalData = RoundManager.getRoundData(interaction.channel.id);
            canalData.lastActivity = Date.now();

            if (canalData.rounds.length >= 3) {
                return interaction.reply({ content: "❌ Já foram registrados 3 rounds! Use `/result` para finalizar.", ephemeral: true });
            }

            const gamesense = interaction.options.getNumber('gamesense');
            const mms = interaction.options.getNumber('mms');
            const player = interaction.options.getUser('player');

            if (!canalData.playerId) canalData.playerId = player.id;

            const result = RoundManager.addRound(interaction.channel.id, gamesense, mms);
            if (!result) return;

            const { embed, row } = await this.createRoundResponse(interaction, canalData, result.numRound, gamesense, mms);
            await interaction.reply({ embeds: [embed], components: row ? [row] : [] });
        }

        if (interaction.isButton()) {
            const action = interaction.customId.split('_')[0];

            if (action === 'fechar') {
                if (!perm) return interaction.reply({ content: "❌ Sem permiss��o.", ephemeral: true });
                await interaction.deferReply({ ephemeral: false });
                await interaction.followUp({ content: "🔒 Fechando canal em 5 segundos..." });
                setTimeout(() => {
                    RoundManager.deleteRoundData(interaction.channel.id);
                    interaction.channel.delete().catch(() => {});
                }, 5000);
            }

            if (action === 'result') {
                if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
                await interaction.reply({ content: "Use `/result` neste canal para registrar o resultado.", ephemeral: true });
            }
        }

        if (interaction.isChatInputCommand() && interaction.commandName === 'result') {
            if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });

            await interaction.deferReply({ ephemeral: true });

            const target = interaction.options.getUser('player');
            const tierRole = interaction.options.getRole('tier');
            const ign = interaction.options.getString('ign');

            const canalData = RoundManager.getRoundData(interaction.channel.id);
            const temRounds = canalData && canalData.rounds.length > 0;

            try {
                const member = await interaction.guild.members.fetch(target.id);
                await member.roles.add(tierRole.id).catch(() => {});
                await member.roles.remove(UNRANKED_ROLE_ID).catch(() => {});
                await member.roles.add(TESTADO_ROLE_ID).catch(() => {});
            } catch (err) {
                console.error('Erro ao gerenciar cargos:', err);
            }

            if (canalData?.roleId && interaction.client.cooldowns) {
                const cooldownKey = `${target.id}:${canalData.roleId}`;
                interaction.client.cooldowns.set(cooldownKey, Date.now() + COOLDOWN_MS);
                if (interaction.client.saveCooldowns) {
                    interaction.client.saveCooldowns();
                }
            }

            const embed = EmbedFactory.createResultEmbed(target, tierRole, ign, interaction.user, canalData, temRounds, false);

            try {
                const logCh = await interaction.guild.channels.fetch(RESULT_LOG_CHANNEL_ID);
                if (logCh) await logCh.send({ embeds: [embed] });
            } catch (err) {
                console.error('Erro ao mandar no canal de resultado:', err.message);
            }

            RoundManager.deleteRoundData(interaction.channel.id);
            await interaction.followUp({ content: `✅ Resultado de <@${target.id}> postado em <#${RESULT_LOG_CHANNEL_ID}>!`, ephemeral: true });
        }

        if (interaction.isChatInputCommand() && interaction.commandName === 'high-round') {
            if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });

            const channelId = interaction.channel.id;
            if (!RoundManager.getHighRoundData(channelId)) {
                RoundManager.setHighRoundData(channelId, { rounds: [], playerId: null, totalRounds: null, lastActivity: Date.now() });
            }

            const hData = RoundManager.getHighRoundData(channelId);
            hData.lastActivity = Date.now();

            const totalRoundsOpt = interaction.options.getInteger('total-rounds');
            if (totalRoundsOpt && !hData.totalRounds) {
                hData.totalRounds = totalRoundsOpt;
            }
            const maxRounds = hData.totalRounds || 3;

            if (hData.rounds.length >= maxRounds) {
                return interaction.reply({ content: `❌ Já foram registrados ${maxRounds} round(s)! Use \`/high-result\` para finalizar.`, ephemeral: true });
            }

            const gamesense = interaction.options.getNumber('gamesense');
            const mms = interaction.options.getNumber('mms');
            const player = interaction.options.getUser('player');

            if (!hData.playerId) hData.playerId = player.id;

            const result = RoundManager.addHighRound(channelId, gamesense, mms);
            if (!result) return;

            const embed = await this.createHighRoundResponse(hData, result.numRound, maxRounds, gamesense, mms);
            await interaction.reply({ embeds: [embed] });
        }

        if (interaction.isChatInputCommand() && interaction.commandName === 'high-result') {
            if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });

            await interaction.deferReply({ ephemeral: true });

            const target = interaction.options.getUser('player');
            const tierRole = interaction.options.getRole('tier');
            const ign = interaction.options.getString('ign');

            const hData = RoundManager.getHighRoundData(interaction.channel.id);
            const temRoundsH = hData && hData.rounds.length > 0;

            try {
                const member = await interaction.guild.members.fetch(target.id);
                await member.roles.add(tierRole.id).catch(() => {});
            } catch (err) {
                console.error('Erro ao dar cargo high tier:', err);
            }

            const embed = EmbedFactory.createResultEmbed(target, tierRole, ign, interaction.user, hData, temRoundsH, true);

            try {
                const highCh = await interaction.guild.channels.fetch(HIGH_RESULT_CHANNEL_ID);
                if (highCh) await highCh.send({ embeds: [embed] });
            } catch (err) {
                console.error('Erro ao mandar no canal high-result:', err.message);
            }

            RoundManager.deleteHighRoundData(interaction.channel.id);
            await interaction.followUp({ content: `✅ High Result de <@${target.id}> postado em <#${HIGH_RESULT_CHANNEL_ID}>!`, ephemeral: true });
        }

        if (interaction.isChatInputCommand() && interaction.commandName === 'resetar-cooldown') {
            if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });

            const target = interaction.options.getUser('player');
            const role = interaction.options.getRole('cargo');

            if (!interaction.client.cooldowns) {
                interaction.client.cooldowns = new Map();
            }

            if (role) {
                const cooldownKey = `${target.id}:${role.id}`;
                interaction.client.cooldowns.delete(cooldownKey);
                if (interaction.client.saveCooldowns) interaction.client.saveCooldowns();
                await interaction.reply({ content: `✅ Cooldown de <@${target.id}> na fila **${role.name}** resetado!`, ephemeral: true });
            } else {
                for (const key of interaction.client.cooldowns.keys()) {
                    if (key.startsWith(`${target.id}:`)) interaction.client.cooldowns.delete(key);
                }
                if (interaction.client.saveCooldowns) interaction.client.saveCooldowns();
                await interaction.reply({ content: `✅ Todos os cooldowns de <@${target.id}> resetados!`, ephemeral: true });
            }
        }

        if (interaction.isChatInputCommand() && interaction.commandName === 'blacklist') {
            if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });

            await interaction.deferReply();

            const target = interaction.options.getUser('player');
            const dias = interaction.options.getInteger('dias');

            let member;
            try {
                member = await interaction.guild.members.fetch(target.id);
            } catch {
                return interaction.followUp({ content: "❌ Jogador não encontrado no servidor.", ephemeral: true });
            }

            const removedRoles = member.roles.cache
                .filter(r => r.id !== interaction.guild.id)
                .map(r => r.id);

            try {
                await member.roles.set([]);
            } catch (err) {
                console.error('Erro ao remover cargos:', err.message);
            }

            if (BLACKLIST_ROLE_ID) {
                await member.roles.add(BLACKLIST_ROLE_ID).catch(() => {});
            }

            const expiresAt = dias === 0 ? null : Date.now() + dias * 24 * 60 * 60 * 1000;

            BlacklistManager.set(target.id, { expiresAt, removedRoles });
            BlacklistManager.save();

            if (expiresAt) {
                BlacklistManager.scheduleUnblacklist(target.id, expiresAt, interaction.guild);
            }

            const duracaoTxt = dias === 0 ? '🔴 Permanente' : `**${dias} dia(s)**`;
            const duracaoTxtDM = dias === 0 ? 'permanente' : `${dias} dia(s)`;
            try {
                await target.send(`🚫 Você recebeu uma blacklist no servidor **${interaction.guild.name}** com duração **${duracaoTxtDM}**.`);
            } catch {}

            const expiraValor = expiresAt
                ? `<t:${Math.floor(expiresAt / 1000)}:F>\n(<t:${Math.floor(expiresAt / 1000)}:R>)`
                : '🔴 Nunca';

            const embed = EmbedFactory.createBlacklistEmbed(target, interaction.user, duracaoTxt, expiresAt, expiraValor);

            await interaction.followUp({ embeds: [embed] });

            if (interaction.channel.id !== BLACKLIST_LOG_CHANNEL_ID) {
                try {
                    const logCh = await interaction.guild.channels.fetch(BLACKLIST_LOG_CHANNEL_ID);
                    if (logCh) await logCh.send({ embeds: [embed] });
                } catch {}
            }
        }

        if (interaction.isChatInputCommand() && interaction.commandName === 'unblacklist') {
            if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });

            const target = interaction.options.getUser('player');

            if (!BlacklistManager.has(target.id)) {
                return interaction.reply({ content: "❌ Esse jogador não está na blacklist.", ephemeral: true });
            }

            BlacklistManager.clearTimeout(target.id);
            await BlacklistManager.applyUnblacklist(target.id, interaction.guild);

            await interaction.reply({ content: `✅ <@${target.id}> foi removido da blacklist e seus cargos foram restaurados.`, ephemeral: true });
        }

        if (interaction.isChatInputCommand() && interaction.commandName === 'fechar') {
            if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
            if (!interaction.channel.name.startsWith('teste-')) {
                return interaction.reply({ content: "❌ Este comando só pode ser usado em canais de teste.", ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: false });
            await interaction.followUp({ content: "🔒 Fechando canal em 5 segundos..." });
            setTimeout(() => {
                RoundManager.deleteRoundData(interaction.channel.id);
                interaction.channel.delete().catch(() => {});
            }, 5000);
        }
    }

    async updateMainEmbed() {
        if (!this.mainQueueMessage) return;
        try {
            const { embed, row } = EmbedFactory.createMainQueueEmbed(QueueManager.getActiveTesters());
            await this.mainQueueMessage.edit({ embeds: [embed], components: row ? [row] : [] });
        } catch (err) {
            console.error('Erro ao atualizar embed:', err);
        }
    }

    async createRoundResponse(interaction, canalData, numRound, gamesense, mms) {
        const media = (gamesense + mms) / 2;
        const embed = new EmbedBuilder()
            .setTitle(`📊 Round ${numRound} Registrado`)
            .setColor(0x5865F2)
            .addFields(
                { name: '🎯 Noção de Jogo', value: `**${gamesense}/20**`, inline: true },
                { name: '⚙️ MMS', value: `**${mms}/20**`, inline: true },
                { name: '📈 Média', value: `**${media.toFixed(1)}/20**`, inline: true }
            )
            .setFooter({ text: `${numRound}/3 rounds registrados` })
            .setTimestamp();

        if (numRound === 3) {
            const somaMedias = canalData.rounds.reduce((acc, r) => acc + r.media, 0);
            const mediaTier = somaMedias / 3;
            embed.addFields(
                { name: '\u200B', value: '─────────────────', inline: false },
                { name: '🏆 Média Tier (MT)', value: `**${mediaTier.toFixed(2)}/20**`, inline: false },
                { name: '📋 Resumo', value: canalData.rounds.map((r, i) => `Round ${i+1}: GS ${r.gamesense} | MMS ${r.mms} | Média ${r.media.toFixed(1)}`).join('\n'), inline: false }
            );
            embed.setColor(0x00FF00);
            embed.setFooter({ text: '3/3 rounds completos — use /result para finalizar' });
        }

        return { embed, row: null };
    }

    async createHighRoundResponse(hData, numRound, maxRounds, gamesense, mms) {
        const media = (gamesense + mms) / 2;
        const isLast = numRound >= maxRounds;

        const embed = new EmbedBuilder()
            .setTitle(`⚡ High Round ${numRound} Registrado`)
            .setColor(0xFFA500)
            .addFields(
                { name: '🎯 Noção de Jogo', value: `**${gamesense}/30**`, inline: true },
                { name: '⚙️ MMS', value: `**${mms}/30**`, inline: true },
                { name: '📈 Média', value: `**${media.toFixed(1)}/30**`, inline: true }
            )
            .setFooter({ text: `${numRound}/${maxRounds} rounds registrados — High Test` })
            .setTimestamp();

        if (isLast) {
            const somaH = hData.rounds.reduce((acc, r) => acc + r.media, 0);
            const mht = somaH / numRound;
            const passou = mht >= 19;
            embed.addFields(
                { name: '\u200B', value: '━━━━━━━━━━━━━━━━━━━━━━━', inline: false },
                { name: '🏆 Média High Tier (MHT)', value: `**${mht.toFixed(2)}/30**`, inline: false },
                { name: '📋 Resumo', value: hData.rounds.map((r, i) => `Round ${i+1}: GS ${r.gamesense} | MMS ${r.mms} | Média ${r.media.toFixed(1)}`).join('\n'), inline: false },
                { name: '\u200B', value: passou ? '🌟 ━━━━━━━━━━━━━━━━━━━━━━━\n✅ **PASSOU O HIGH TEST!** Performance incrível!\n🌟 ━━━━━━━━━━━━━━━━━━━━━━━' : '🔴 ━━━━━━━━━━━━━━━━━━━━━━━\n❌ **NÃO PASSOU O HIGH TEST.** Média insuficiente.\n🔴 ━━━━━━━━━━━━━━━━━━━━━━━', inline: false }
            );
            embed.setColor(passou ? 0xFFD700 : 0xFF4444);
            embed.setFooter({ text: `${numRound}/${maxRounds} rounds completos — use /high-result para finalizar` });
        }

        return embed;
    }
}

module.exports = new InteractionHandler();