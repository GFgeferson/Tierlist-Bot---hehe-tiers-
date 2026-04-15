// ======================== HEHE TIERS BOT ========================

require('dotenv').config();

const TOKEN                  = process.env.TOKEN;
const CLIENT_ID              = process.env.CLIENT_ID;
const GUILD_ID               = process.env.GUILD_ID;
const CATEGORY_TICKETS_ID    = process.env.CATEGORY_TICKETS_ID;
const UNRANKED_ROLE_ID       = process.env.UNRANKED_ROLE_ID;
const TESTADO_ROLE_ID        = process.env.TESTADO_ROLE_ID;

const PING_ROLE_IDS          = process.env.PING_ROLE_IDS ? process.env.PING_ROLE_IDS.split(',') : [];
const ALLOWED_ROLE_IDS       = process.env.ALLOWED_ROLE_IDS ? process.env.ALLOWED_ROLE_IDS.split(',') : [];
const BLACKLIST_RETURN_ROLES = process.env.BLACKLIST_RETURN_ROLES ? process.env.BLACKLIST_RETURN_ROLES.split(',') : [];

const BLACKLIST_ROLE_ID      = process.env.BLACKLIST_ROLE_ID;

const HIGH_RESULT_CHANNEL_ID   = process.env.HIGH_RESULT_CHANNEL_ID;
const BLACKLIST_LOG_CHANNEL_ID = process.env.BLACKLIST_LOG_CHANNEL_ID;
const RESULT_LOG_CHANNEL_ID    = process.env.RESULT_LOG_CHANNEL_ID;
const LEAVE_TEXT_CHANNEL_ID    = process.env.LEAVE_TEXT_CHANNEL_ID;
const STATUS_CHANNEL_ID        = process.env.STATUS_CHANNEL_ID;

const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
    SlashCommandBuilder, REST, Routes, ChannelType, PermissionFlagsBits 
} = require('discord.js');

const fs   = require('fs');
const path = require('path');

const DATA_FILE      = path.join(__dirname, 'data.json');
const COOLDOWN_FILE  = path.join(__dirname, 'cooldowns.json');
const BLACKLIST_FILE = path.join(__dirname, 'blacklist.json');

// activeTesters: Map<roleId, { roleName, staffId, queue: [userId], pingMessageId?, pingChannelId? }>
let activeTesters = new Map();
if (fs.existsSync(DATA_FILE)) {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    activeTesters = new Map(Object.entries(saved));
}

// cooldowns: Map<"userId:roleId", timestampMs>
let cooldowns = new Map();
if (fs.existsSync(COOLDOWN_FILE)) {
    const saved = JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8'));
    cooldowns = new Map(Object.entries(saved));
}

// blacklist: Map<userId, { expiresAt: timestampMs|null, removedRoles: [roleId] }>
let blacklist = new Map();
if (fs.existsSync(BLACKLIST_FILE)) {
    const saved = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));
    blacklist = new Map(Object.entries(saved));
}

function saveBlacklist() {
    fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(Object.fromEntries(blacklist), null, 2));
}

// rounds: Map<channelId, { rounds: [{gamesense, mms, media}], playerId, roleId, lastActivity }>
const roundData = new Map();

// highRounds: Map<channelId, { rounds: [{gamesense, mms, media}], playerId, lastActivity }>
const highRoundData = new Map();

// Limpeza automática de rounds esquecidos após 1 hora de inatividade
const ROUND_EXPIRE_MS = 60 * 60 * 1000; // 1 hora
setInterval(() => {
    const now = Date.now();
    for (const [channelId, data] of roundData) {
        if (now - data.lastActivity > ROUND_EXPIRE_MS) {
            roundData.delete(channelId);
            console.log(`🧹 roundData do canal ${channelId} expirado e removido.`);
        }
    }
    for (const [channelId, data] of highRoundData) {
        if (now - data.lastActivity > ROUND_EXPIRE_MS) {
            highRoundData.delete(channelId);
            console.log(`🧹 highRoundData do canal ${channelId} expirado e removido.`);
        }
    }
}, 5 * 60 * 1000); // verifica a cada 5 minutos

// Limpeza de cooldowns expirados (1x por dia)
setInterval(() => {
    const now = Date.now();
    let removed = 0;
    for (const [key, expiresAt] of cooldowns) {
        if (now > expiresAt) { cooldowns.delete(key); removed++; }
    }
    if (removed > 0) { 
        saveCooldowns(); 
        console.log(`🧹 ${removed} cooldown(s) expirado(s) removido(s).`); 
    }
}, 24 * 60 * 60 * 1000);

// queueNotifyIntervals: Map<roleId, intervalId>
const queueNotifyIntervals = new Map();

// emptyQueueTimeouts: Map<roleId, timeoutId>
const emptyQueueTimeouts = new Map();

// testerActivityTimeouts: Map<roleId, timeoutId>
const testerActivityTimeouts = new Map();

// testerLastActivity: Map<roleId, timestampMs>
const testerLastActivity = new Map();

const TESTER_INACTIVE_MS = 15 * 60 * 1000; // 15 minutos
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

const STATUS_MSG_FILE = path.join(__dirname, 'status_msg.json');

let mainQueueMessage = null;

// ======================== SALVAR DADOS ========================
function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(Object.fromEntries(activeTesters), null, 2));
}

function saveCooldowns() {
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(Object.fromEntries(cooldowns), null, 2));
}

// ======================== PERMISSÃO ========================
function canOperate(member) {
    if (!member) return false;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    for (const id of ALLOWED_ROLE_IDS) {
        if (member.roles.cache.has(id)) return true;
    }
    for (const [roleId] of activeTesters) {
        if (member.roles.cache.has(roleId)) return true;
    }
    return false;
}

// ======================== EMBED PRINCIPAL ========================
function createMainEmbed() {
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

async function updateMainEmbed() {
    if (!mainQueueMessage) return;
    try {
        const { embed, row } = createMainEmbed();
        await mainQueueMessage.edit({ embeds: [embed], components: row ? [row] : [] });
    } catch (err) {
        console.error('Erro ao atualizar embed:', err);
    }
}

// ======================== NOTIFICAÇÃO DE FILA NO PV ========================
function startQueueNotify(roleId) {
    stopQueueNotify(roleId);

    const interval = setInterval(async () => {
        const data = activeTesters.get(roleId);
        if (!data || data.queue.length === 0) {
            stopQueueNotify(roleId);
            return;
        }

        const firstInQueue = data.queue[0];

        try {
            const staffUser = await client.users.fetch(data.staffId);
            const playerUser = await client.users.fetch(firstInQueue);
            await staffUser.send(`⏳ **${playerUser.username}** está esperando na fila **${data.roleName}**`);
        } catch (err) {
            console.error(`Erro ao enviar DM de fila [${roleId}]:`, err.message);
        }
    }, 60 * 1000);

    queueNotifyIntervals.set(roleId, interval);
}

function stopQueueNotify(roleId) {
    if (queueNotifyIntervals.has(roleId)) {
        clearInterval(queueNotifyIntervals.get(roleId));
        queueNotifyIntervals.delete(roleId);
    }
}

// ======================== AUTO-FECHAR FILA VAZIA ========================
function startEmptyQueueTimeout(roleId, guild) {
    cancelEmptyQueueTimeout(roleId);

    const guildId = guild.id;
    const timeout = setTimeout(async () => {
        const data = activeTesters.get(roleId);
        if (!data || data.queue.length > 0) return;

        const freshGuild = await client.guilds.fetch(guildId).catch(() => null);

        if (freshGuild && data.pingMessageId && data.pingChannelId) {
            try {
                const ch = await freshGuild.channels.fetch(data.pingChannelId);
                const msg = await ch.messages.fetch(data.pingMessageId);
                await msg.delete();
            } catch {}
        }

        stopQueueNotify(roleId);
        activeTesters.delete(roleId);
        saveData();
        await updateMainEmbed();

        try {
            const staffUser = await client.users.fetch(data.staffId);
            await staffUser.send(`⏰ Sua fila **${data.roleName}** foi fechada automaticamente por inatividade (30 minutos).`);
        } catch {}

        console.log(`⏰ Fila ${data.roleName} [${roleId}] fechada por inatividade (fila vazia).`);
    }, 30 * 60 * 1000);

    emptyQueueTimeouts.set(roleId, timeout);
}

function cancelEmptyQueueTimeout(roleId) {
    if (emptyQueueTimeouts.has(roleId)) {
        clearTimeout(emptyQueueTimeouts.get(roleId));
        emptyQueueTimeouts.delete(roleId);
    }
}

// ======================== COMANDOS ========================
const commands = [
    new SlashCommandBuilder()
        .setName('postar-fila')
        .setDescription('Posta a embed principal da fila'),

    new SlashCommandBuilder()
        .setName('ativar-fila')
        .setDescription('Ativa a fila de um tester')
        .addRoleOption(opt => opt.setName('cargo').setDescription('Cargo do tester').setRequired(true)),

    new SlashCommandBuilder()
        .setName('desativar-fila')
        .setDescription('Desativa a fila de um tester (ou todos)')
        .addRoleOption(opt => opt.setName('cargo').setDescription('Cargo para desativar (vazio = todos)')),

    new SlashCommandBuilder()
        .setName('next')
        .setDescription('Puxa o próximo da fila')
        .addRoleOption(opt => opt.setName('cargo').setDescription('Cargo do tester').setRequired(true)),

    new SlashCommandBuilder()
        .setName('round')
        .setDescription('Registra as notas de um round (máx 3 por teste)')
        .addNumberOption(opt => opt.setName('gamesense').setDescription('Nota de Noção de Jogo (0-20)').setRequired(true).setMinValue(0).setMaxValue(20))
        .addNumberOption(opt => opt.setName('mms').setDescription('Nota de MMS (0-20)').setRequired(true).setMinValue(0).setMaxValue(20))
        .addUserOption(opt => opt.setName('player').setDescription('Jogador sendo testado').setRequired(true)),

    new SlashCommandBuilder()
        .setName('result')
        .setDescription('Anuncia o resultado do teste')
        .addUserOption(opt => opt.setName('player').setDescription('Jogador testado').setRequired(true))
        .addRoleOption(opt => opt.setName('tier').setDescription('Cargo de tier que o jogador vai receber').setRequired(true))
        .addStringOption(opt => opt.setName('ign').setDescription('Nickname do jogador no jogo').setRequired(true)),

    new SlashCommandBuilder()
        .setName('fechar')
        .setDescription('Fecha o canal de teste atual'),

    new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Sai da fila de um tester')
        .addRoleOption(opt => opt.setName('cargo').setDescription('Cargo do tester cuja fila deseja sair').setRequired(true)),

    new SlashCommandBuilder()
        .setName('resetar-cooldown')
        .setDescription('Reseta o cooldown de um jogador em uma fila específica')
        .addUserOption(opt => opt.setName('player').setDescription('Jogador').setRequired(true))
        .addRoleOption(opt => opt.setName('cargo').setDescription('Cargo da fila (vazio = reseta tudo)').setRequired(false)),

    new SlashCommandBuilder()
        .setName('blacklist')
        .setDescription('Coloca um jogador na blacklist removendo todos os cargos')
        .addUserOption(opt => opt.setName('player').setDescription('Jogador').setRequired(true))
        .addIntegerOption(opt => opt.setName('dias').setDescription('Duração em dias (0 = permanente)').setRequired(true).setMinValue(0)),

    new SlashCommandBuilder()
        .setName('unblacklist')
        .setDescription('Remove um jogador da blacklist manualmente')
        .addUserOption(opt => opt.setName('player').setDescription('Jogador').setRequired(true)),

    new SlashCommandBuilder()
        .setName('high-round')
        .setDescription('Registra um round do High Test (notas de 10 a 30)')
        .addNumberOption(opt => opt.setName('gamesense').setDescription('Nocao de Jogo (10-30)').setRequired(true).setMinValue(10).setMaxValue(30))
        .addNumberOption(opt => opt.setName('mms').setDescription('MMS (10-30)').setRequired(true).setMinValue(10).setMaxValue(30))
        .addUserOption(opt => opt.setName('player').setDescription('Jogador sendo testado').setRequired(true))
        .addIntegerOption(opt => opt.setName('total-rounds').setDescription('Quantos rounds no total? (1, 2 ou 3)').setRequired(false).addChoices(
            { name: '1 round', value: 1 },
            { name: '2 rounds', value: 2 },
            { name: '3 rounds', value: 3 }
        )),

    new SlashCommandBuilder()
        .setName('high-result')
        .setDescription('Anuncia o resultado do High Test')
        .addUserOption(opt => opt.setName('player').setDescription('Jogador testado').setRequired(true))
        .addRoleOption(opt => opt.setName('tier').setDescription('Cargo de tier a dar').setRequired(true))
        .addStringOption(opt => opt.setName('ign').setDescription('Nickname do jogador no jogo').setRequired(true)),

].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log('✅ Comandos registrados!');
    } catch (err) {
        console.error('Erro ao registrar comandos:', err);
    }
})();

// ======================== BLACKLIST ========================
const blacklistTimeouts = new Map();

async function applyUnblacklist(userId, guild) {
    blacklist.delete(userId);
    saveBlacklist();
    blacklistTimeouts.delete(userId);

    try {
        const member = await guild.members.fetch(userId);
        await member.roles.remove(BLACKLIST_ROLE_ID).catch(() => {});
        for (const roleId of BLACKLIST_RETURN_ROLES) {
            await member.roles.add(roleId).catch(() => {});
        }
        await member.send(`✅ Sua blacklist no servidor **${guild.name}** expirou. Seus cargos foram restaurados.`).catch(() => {});
    } catch (err) {
        console.error(`Erro ao remover blacklist de ${userId}:`, err.message);
    }
}

function scheduleUnblacklist(userId, expiresAt, guild) {
    if (!expiresAt) return;
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
        applyUnblacklist(userId, guild);
        return;
    }
    const safeDelay = Math.min(delay, 2147483647);
    const t = setTimeout(async () => {
        const entry = blacklist.get(userId);
        if (entry && Date.now() >= entry.expiresAt) {
            await applyUnblacklist(userId, guild);
        }
    }, safeDelay);
    blacklistTimeouts.set(userId, t);
}

// ======================== INATIVIDADE DO TESTER ========================
function startTesterActivityTimeout(roleId, guild) {
    cancelTesterActivityTimeout(roleId);
    testerLastActivity.set(roleId, Date.now());

    const guildId = guild.id;
    const timeout = setTimeout(async () => {
        const data = activeTesters.get(roleId);
        if (!data || data.queue.length === 0) return;

        const freshGuild = await client.guilds.fetch(guildId).catch(() => null);
        if (!freshGuild) return;

        for (const userId of data.queue) {
            try {
                const user = await client.users.fetch(userId);
                const embed = new EmbedBuilder()
                    .setTitle('😴 Tester Inativo — Fila Encerrada')
                    .setColor(0xFF6B00)
                    .setDescription(`Parece que o tester <@&${roleId}> está offline ou inativo.\n\nA fila **${data.roleName}** foi encerrada automaticamente para não te deixar esperando à toa.`)
                    .addFields({ name: '🔁 O que fazer?', value: 'Fique de olho no servidor — quando uma nova fila for aberta, você será avisado.' })
                    .setFooter({ text: 'HEHE TIERS • Sistema Automático' })
                    .setTimestamp();
                await user.send({ embeds: [embed] });
            } catch {}
        }

        if (data.pingMessageId && data.pingChannelId) {
            try {
                const ch = await freshGuild.channels.fetch(data.pingChannelId);
                const msg = await ch.messages.fetch(data.pingMessageId);
                await msg.delete();
            } catch {}
        }

        stopQueueNotify(roleId);
        cancelEmptyQueueTimeout(roleId);
        testerLastActivity.delete(roleId);
        activeTesters.delete(roleId);
        saveData();
        await updateMainEmbed();

        console.log(`😴 Fila ${data.roleName} [${roleId}] fechada por inatividade do tester.`);
    }, TESTER_INACTIVE_MS);

    testerActivityTimeouts.set(roleId, timeout);
}

function cancelTesterActivityTimeout(roleId) {
    if (testerActivityTimeouts.has(roleId)) {
        clearTimeout(testerActivityTimeouts.get(roleId));
        testerActivityTimeouts.delete(roleId);
    }
    testerLastActivity.delete(roleId);
}

function refreshTesterActivity(roleId, guild) {
    if (!activeTesters.has(roleId)) return;
    const data = activeTesters.get(roleId);
    if (data.queue.length === 0) return;
    testerLastActivity.set(roleId, Date.now());
    startTesterActivityTimeout(roleId, guild);
}

// ======================== INTERACTIONS ========================
client.on('interactionCreate', async interaction => {
    if (!interaction.guild) return;

    const perm = canOperate(interaction.member);

    // ── /postar-fila ──────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'postar-fila') {
        if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
        const { embed, row } = createMainEmbed();
        await interaction.reply({ content: '✅ Embed enviada!', ephemeral: true });
        mainQueueMessage = await interaction.channel.send({ embeds: [embed], components: row ? [row] : [] });
    }

    // ── /ativar-fila ──────────────────────────────────────────────────────────
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

        activeTesters.set(role.id, {
            roleName: role.name,
            staffId: interaction.user.id,
            queue: [],
            pingMessageId,
            pingChannelId
        });
        saveData();
        await updateMainEmbed();
        startEmptyQueueTimeout(role.id, interaction.guild);
        await interaction.reply({ content: `✅ Tester <@&${role.id}> ativado!`, ephemeral: true });
    }

    // ── /desativar-fila ───────────────────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'desativar-fila') {
        if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
        const role = interaction.options.getRole('cargo');

        if (role) {
            if (!activeTesters.has(role.id)) return interaction.reply({ content: "❌ Cargo não está ativo.", ephemeral: true });

            const data = activeTesters.get(role.id);

            if (data.pingMessageId && data.pingChannelId) {
                try {
                    const ch = await interaction.guild.channels.fetch(data.pingChannelId);
                    const msg = await ch.messages.fetch(data.pingMessageId);
                    await msg.delete();
                } catch (err) {
                    console.error('Erro ao apagar mensagem de ping:', err.message);
                }
            }

            stopQueueNotify(role.id);
            cancelEmptyQueueTimeout(role.id);
            cancelTesterActivityTimeout(role.id);
            activeTesters.delete(role.id);
        } else {
            for (const [roleId, data] of activeTesters) {
                if (data.pingMessageId && data.pingChannelId) {
                    try {
                        const ch = await interaction.guild.channels.fetch(data.pingChannelId);
                        const msg = await ch.messages.fetch(data.pingMessageId);
                        await msg.delete();
                    } catch {}
                }
                stopQueueNotify(roleId);
                cancelEmptyQueueTimeout(roleId);
                cancelTesterActivityTimeout(roleId);
            }
            activeTesters.clear();
        }

        saveData();
        await updateMainEmbed();
        await interaction.reply({ content: role ? `✅ Tester <@&${role.id}> desativado.` : "✅ Todos desativados.", ephemeral: true });
    }

    // ── /leave ────────────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'leave') {
        const role = interaction.options.getRole('cargo');
        if (!activeTesters.has(role.id)) return interaction.reply({ content: "❌ Esse tester não está ativo.", ephemeral: true });
        const data = activeTesters.get(role.id);
        const idx = data.queue.indexOf(interaction.user.id);
        if (idx === -1) return interaction.reply({ content: "❌ Você não está nessa fila.", ephemeral: true });
        const wasFirst = idx === 0;
        data.queue.splice(idx, 1);
        saveData();
        await updateMainEmbed();

        if (wasFirst && data.queue.length > 0) {
            startQueueNotify(role.id);
        } else if (data.queue.length === 0) {
            stopQueueNotify(role.id);
            cancelTesterActivityTimeout(role.id);
            startEmptyQueueTimeout(role.id, interaction.guild);
        }

        await interaction.reply({ content: `✅ Você saiu da fila de **${data.roleName}**.`, ephemeral: true });
    }

    // ── Entrar na fila via menu ───────────────────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_tester') {
        const roleId = interaction.values[0];
        if (!activeTesters.has(roleId)) return interaction.reply({ content: "Tester não está mais ativo.", ephemeral: true });

        if (blacklist.has(interaction.user.id)) {
            const entry = blacklist.get(interaction.user.id);
            const expiraTxt = entry.expiresAt
                ? `Expira em <t:${Math.floor(entry.expiresAt / 1000)}:R>.`
                : 'Sua blacklist é permanente.';
            return interaction.reply({ content: `🚫 Você está na blacklist e não pode entrar em nenhuma fila. ${expiraTxt}`, ephemeral: true });
        }

        const cooldownKey = `${interaction.user.id}:${roleId}`;
        const now = Date.now();
        const available = cooldowns.get(cooldownKey);
        if (available && now < available) {
            const dias = Math.ceil((available - now) / (1000 * 60 * 60 * 24));
            return interaction.reply({ content: `⏳ Você precisa aguardar **${dias} dia(s)** para entrar nessa fila novamente.`, ephemeral: true });
        }

        const data = activeTesters.get(roleId);

        if (data.queue.includes(interaction.user.id)) {
            return interaction.reply({ content: "❌ Você já está nessa fila!", ephemeral: true });
        }

        const wasEmpty = data.queue.length === 0;
        data.queue.push(interaction.user.id);
        saveData();
        await updateMainEmbed();
        cancelEmptyQueueTimeout(roleId);

        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            await member.roles.add(UNRANKED_ROLE_ID);
        } catch (err) {
            console.error('Erro ao dar unranked:', err);
        }

        if (wasEmpty) {
            startQueueNotify(roleId);
            startTesterActivityTimeout(roleId, interaction.guild);
        }

        await interaction.reply({ content: `✅ Você entrou na fila de **${data.roleName}**! Use \`/leave\` caso queira sair.`, ephemeral: true });
    }

    // ── /next ─────────────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'next') {
        if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });

        const role = interaction.options.getRole('cargo');
        if (!activeTesters.has(role.id)) return interaction.reply({ content: "Tester não encontrado.", ephemeral: true });

        const data = activeTesters.get(role.id);
        if (data.queue.length === 0) return interaction.reply({ content: "Fila vazia!", ephemeral: true });

        await interaction.deferReply({ ephemeral: true });

        const nextId = data.queue[0];
        const player = await client.users.fetch(nextId);

        let ticketChannel;
        try {
            ticketChannel = await interaction.guild.channels.create({
                name: `teste-${player.username}`,
                type: ChannelType.GuildText,
                parent: CATEGORY_TICKETS_ID,
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
        saveData();
        await updateMainEmbed();

        refreshTesterActivity(role.id, interaction.guild);

        if (data.queue.length > 0) {
            startQueueNotify(role.id);
        } else {
            stopQueueNotify(role.id);
            cancelTesterActivityTimeout(role.id);
        }

        roundData.set(ticketChannel.id, { rounds: [], playerId: nextId, roleId: role.id, lastActivity: Date.now() });

        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fechar_${ticketChannel.id}`).setLabel('Fechar Teste').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`result_${ticketChannel.id}`).setLabel('Dar Resultado').setStyle(ButtonStyle.Success)
        );

        const embed = new EmbedBuilder()
            .setTitle("⚔️ Teste Iniciado")
            .setDescription(`Bem-vindo <@${nextId}>!\n\n🎮 **Modo:** ${data.roleName}\n👤 **Tester:** <@&${role.id}>\n🛡️ **Staff:** <@${data.staffId}>`)
            .setColor(0x5865F2)
            .setTimestamp();

        await ticketChannel.send({
            content: `<@${nextId}> | <@&${role.id}> | <@&${UNRANKED_ROLE_ID}> | <@&${TESTADO_ROLE_ID}>`,
            embeds: [embed],
            components: [btnRow]
        });

        await interaction.followUp({ content: `✅ Canal criado: ${ticketChannel}`, ephemeral: true });
    }

    // ── /round ────────────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'round') {
        if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
        if (!interaction.channel.name?.startsWith('teste-')) {
            return interaction.reply({ content: "❌ Este comando só pode ser usado em canais de teste.", ephemeral: true });
        }

        const canalRound = roundData.get(interaction.channel.id);
        if (canalRound?.roleId) refreshTesterActivity(canalRound.roleId, interaction.guild);

        const channelId = interaction.channel.id;
        if (!roundData.has(channelId)) roundData.set(channelId, { rounds: [], playerId: null, roleId: null, lastActivity: Date.now() });

        const canalData = roundData.get(channelId);
        canalData.lastActivity = Date.now();

        if (canalData.rounds.length >= 3) {
            return interaction.reply({ content: "❌ Já foram registrados 3 rounds! Use `/result` para finalizar.", ephemeral: true });
        }

        const gamesense = interaction.options.getNumber('gamesense');
        const mms       = interaction.options.getNumber('mms');
        const player    = interaction.options.getUser('player');

        if (!canalData.playerId) canalData.playerId = player.id;

        const media = (gamesense + mms) / 2;
        canalData.rounds.push({ gamesense, mms, media });

        const numRound = canalData.rounds.length;

        const embed = new EmbedBuilder()
            .setTitle(`📊 Round ${numRound} Registrado`)
            .setColor(0x5865F2)
            .addFields(
                { name: '🎯 Noção de Jogo', value: `**${gamesense}/20**`, inline: true },
                { name: '⚙️ MMS',           value: `**${mms}/20**`,       inline: true },
                { name: '📈 Média',         value: `**${media.toFixed(1)}/20**`, inline: true }
            )
            .setFooter({ text: `${numRound}/3 rounds registrados` })
            .setTimestamp();

        if (numRound === 3) {
            const somaMedias = canalData.rounds.reduce((acc, r) => acc + r.media, 0);
            const mediaTier  = somaMedias / 3;
            embed.addFields(
                { name: '\u200B', value: '─────────────────', inline: false },
                { name: '🏆 Média Tier (MT)', value: `**${mediaTier.toFixed(2)}/20**`, inline: false },
                { name: '📋 Resumo', value: canalData.rounds.map((r, i) => `Round ${i+1}: GS ${r.gamesense} | MMS ${r.mms} | Média ${r.media.toFixed(1)}`).join('\n'), inline: false }
            );
            embed.setColor(0x00FF00);
            embed.setFooter({ text: '3/3 rounds completos — use /result para finalizar' });
        }

        await interaction.reply({ embeds: [embed] });
    }

    // ── Botões no ticket ──────────────────────────────────────────────────────
    if (interaction.isButton()) {
        const action = interaction.customId.split('_')[0];

        if (action === 'fechar') {
            if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
            await interaction.deferReply({ ephemeral: false });
            await interaction.followUp({ content: "🔒 Fechando canal em 5 segundos..." });
            setTimeout(() => {
                roundData.delete(interaction.channel.id);
                interaction.channel.delete().catch(() => {});
            }, 5000);
        }

        if (action === 'result') {
            if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
            await interaction.reply({ content: "Use `/result` neste canal para registrar o resultado.", ephemeral: true });
        }
    }

    // ── /result ───────────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'result') {
        if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });

        await interaction.deferReply({ ephemeral: true });

        const target   = interaction.options.getUser('player');
        const tierRole = interaction.options.getRole('tier');
        const ign      = interaction.options.getString('ign');

        const canalData = roundData.get(interaction.channel.id);
        const temRounds = canalData && canalData.rounds.length > 0;

        try {
            const member = await interaction.guild.members.fetch(target.id);
            await member.roles.add(tierRole.id).catch(() => {});
            await member.roles.remove(UNRANKED_ROLE_ID).catch(() => {});
            await member.roles.add(TESTADO_ROLE_ID).catch(() => {});
        } catch (err) {
            console.error('Erro ao gerenciar cargos:', err);
        }

        const roleId = canalData?.roleId;
        if (roleId) {
            const cooldownKey = `${target.id}:${roleId}`;
            cooldowns.set(cooldownKey, Date.now() + COOLDOWN_MS);
            saveCooldowns();
        }

        const embed = new EmbedBuilder()
            .setTitle('🏆 RESULTADO DO TESTE')
            .setColor(0x00FF00)
            .setDescription(`O teste de <@${target.id}> foi concluído!`)
            .addFields(
                { name: '👤 Jogador',      value: `<@${target.id}>`,           inline: true },
                { name: '🎮 IGN',          value: `**${ign}**`,                inline: true },
                { name: '🏅 Tier',         value: `<@&${tierRole.id}>`,         inline: true },
                { name: '🛡️ Avaliado por', value: `<@${interaction.user.id}>`, inline: false }
            )
            .setThumbnail(target.displayAvatarURL())
            .setTimestamp();

        if (temRounds) {
            const somaMedias = canalData.rounds.reduce((acc, r) => acc + r.media, 0);
            const mediaTier  = somaMedias / canalData.rounds.length;
            embed.addFields(
                { name: '\u200B', value: '─────────────────', inline: false },
                { name: '📋 Rounds', value: canalData.rounds.map((r, i) => `Round ${i+1}: GS ${r.gamesense} | MMS ${r.mms} | Média ${r.media.toFixed(1)}`).join('\n'), inline: false },
                { name: '📊 Média Tier (MT)', value: `**${mediaTier.toFixed(2)}/20**`, inline: false }
            );
            if (mediaTier >= 18.5) {
                embed.addFields({ name: '\u200B', value: '🌟 ━━━━━━━━━━━━━━━━━━━━━━━\n✅ **PASSOU EVAL!** Desempenho acima do esperado!\n🌟 ━━━━━━━━━━━━━━━━━━━━━━━', inline: false });
                embed.setColor(0xFFD700);
            }
        }

        embed.setFooter({ text: `Resultado • ${new Date().toLocaleDateString('pt-BR')}` });

        try {
            const logCh = await interaction.guild.channels.fetch(RESULT_LOG_CHANNEL_ID);
            if (logCh) await logCh.send({ embeds: [embed] });
        } catch (err) {
            console.error('Erro ao mandar no canal de resultado:', err.message);
        }

        roundData.delete(interaction.channel.id);
        await interaction.followUp({ content: `✅ Resultado de <@${target.id}> postado em <#${RESULT_LOG_CHANNEL_ID}>!`, ephemeral: true });
    }

    // ── /high-round ───────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'high-round') {
        if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });

        const channelId = interaction.channel.id;
        if (!highRoundData.has(channelId)) highRoundData.set(channelId, { rounds: [], playerId: null, totalRounds: null, lastActivity: Date.now() });

        const hData = highRoundData.get(channelId);
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
        const mms       = interaction.options.getNumber('mms');
        const player    = interaction.options.getUser('player');

        if (!hData.playerId) hData.playerId = player.id;

        const media = (gamesense + mms) / 2;
        hData.rounds.push({ gamesense, mms, media });

        const numRound = hData.rounds.length;
        const isLast   = numRound >= maxRounds;

        const embedH = new EmbedBuilder()
            .setTitle(`⚡ High Round ${numRound} Registrado`)
            .setColor(0xFFA500)
            .addFields(
                { name: '🎯 Noção de Jogo', value: `**${gamesense}/30**`, inline: true },
                { name: '⚙️ MMS',           value: `**${mms}/30**`,       inline: true },
                { name: '📈 Média',         value: `**${media.toFixed(1)}/30**`, inline: true }
            )
            .setFooter({ text: `${numRound}/${maxRounds} rounds registrados — High Test` })
            .setTimestamp();

        if (isLast) {
            const somaH  = hData.rounds.reduce((acc, r) => acc + r.media, 0);
            const mht    = somaH / numRound;
            const passou = mht >= 19;
            embedH.addFields(
                { name: '\u200B', value: '━━━━━━━━━━━━━━━━━━━━━━━', inline: false },
                { name: '🏆 Média High Tier (MHT)', value: `**${mht.toFixed(2)}/30**`, inline: false },
                { name: '📋 Resumo', value: hData.rounds.map((r, i) => `Round ${i+1}: GS ${r.gamesense} | MMS ${r.mms} | Média ${r.media.toFixed(1)}`).join('\n'), inline: false },
                { name: '\u200B', value: passou ? '🌟 ━━━━━━━━━━━━━━━━━━━━━━━\n✅ **PASSOU O HIGH TEST!** Performance incrível!\n🌟 ━━━━━━━━━━━━━━━━━━━━━━━' : '🔴 ━━━━━━━━━━━━━━━━━━━━━━━\n❌ **NÃO PASSOU O HIGH TEST.** Média insuficiente.\n🔴 ━━━━━━━━━━━━━━━━━━━━━━━', inline: false }
            );
            embedH.setColor(passou ? 0xFFD700 : 0xFF4444);
            embedH.setFooter({ text: `${numRound}/${maxRounds} rounds completos — use /high-result para finalizar` });
        }

        await interaction.reply({ embeds: [embedH] });
    }

    // ── /high-result ──────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'high-result') {
        if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });

        await interaction.deferReply({ ephemeral: true });

        const target   = interaction.options.getUser('player');
        const tierRole = interaction.options.getRole('tier');
        const ign      = interaction.options.getString('ign');

        const hData      = highRoundData.get(interaction.channel.id);
        const temRoundsH = hData && hData.rounds.length > 0;

        try {
            const member = await interaction.guild.members.fetch(target.id);
            await member.roles.add(tierRole.id).catch(() => {});
        } catch (err) {
            console.error('Erro ao dar cargo high tier:', err);
        }

        const embedHR = new EmbedBuilder()
            .setTitle('⚡ RESULTADO DO HIGH TEST')
            .setColor(0xFFD700)
            .setDescription(`O High Test de <@${target.id}> foi concluído!`)
            .addFields(
                { name: '👤 Jogador',      value: `<@${target.id}>`,           inline: true },
                { name: '🎮 IGN',          value: `**${ign}**`,                inline: true },
                { name: '🏅 Tier',         value: `<@&${tierRole.id}>`,         inline: true },
                { name: '🛡️ Avaliado por', value: `<@${interaction.user.id}>`, inline: false }
            )
            .setThumbnail(target.displayAvatarURL())
            .setTimestamp();

        if (temRoundsH) {
            const somaH  = hData.rounds.reduce((acc, r) => acc + r.media, 0);
            const mht    = somaH / hData.rounds.length;
            const passou = mht >= 19;
            embedHR.addFields(
                { name: '\u200B', value: '━━━━━━━━━━━━━━━━━━━━━━━', inline: false },
                { name: '📋 Rounds', value: hData.rounds.map((r, i) => `Round ${i+1}: GS ${r.gamesense} | MMS ${r.mms} | Média ${r.media.toFixed(1)}`).join('\n'), inline: false },
                { name: '📊 Média High Tier (MHT)', value: `**${mht.toFixed(2)}/30**`, inline: false },
                { name: '\u200B', value: passou ? '🌟 ━━━━━━━━━━━━━━━━━━━━━━━\n✅ **PASSOU O HIGH TEST!** Desempenho excepcional!\n🌟 ━━━━━━━━━━━━━━━━━━━━━━━' : '🔴 ━━━━━━━━━━━━━━━━━━━━━━━\n❌ **NÃO PASSOU O HIGH TEST.** Média abaixo de 19.\n🔴 ━━━━━━━━━━━━━━━━━━━━━━━', inline: false }
            );
            embedHR.setColor(passou ? 0xFFD700 : 0xFF4444);
        }

        embedHR.setFooter({ text: `High Test • ${new Date().toLocaleDateString('pt-BR')}` });

        try {
            const highCh = await interaction.guild.channels.fetch(HIGH_RESULT_CHANNEL_ID);
            if (highCh) await highCh.send({ embeds: [embedHR] });
        } catch (err) {
            console.error('Erro ao mandar no canal high-result:', err.message);
        }

        highRoundData.delete(interaction.channel.id);
        await interaction.followUp({ content: `✅ High Result de <@${target.id}> postado em <#${HIGH_RESULT_CHANNEL_ID}>!`, ephemeral: true });
    }

    // ── /resetar-cooldown ─────────────────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'resetar-cooldown') {
        if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });

        const target = interaction.options.getUser('player');
        const role   = interaction.options.getRole('cargo');

        if (role) {
            const cooldownKey = `${target.id}:${role.id}`;
            cooldowns.delete(cooldownKey);
            saveCooldowns();
            await interaction.reply({ content: `✅ Cooldown de <@${target.id}> na fila **${role.name}** resetado!`, ephemeral: true });
        } else {
            for (const key of cooldowns.keys()) {
                if (key.startsWith(`${target.id}:`)) cooldowns.delete(key);
            }
            saveCooldowns();
            await interaction.reply({ content: `✅ Todos os cooldowns de <@${target.id}> resetados!`, ephemeral: true });
        }
    }

    // ── /blacklist ────────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'blacklist') {
        if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });

        await interaction.deferReply();

        const target = interaction.options.getUser('player');
        const dias   = interaction.options.getInteger('dias');

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

        await member.roles.add(BLACKLIST_ROLE_ID).catch(() => {});

        const expiresAt = dias === 0 ? null : Date.now() + dias * 24 * 60 * 60 * 1000;

        blacklist.set(target.id, { expiresAt, removedRoles });
        saveBlacklist();

        if (expiresAt) {
            scheduleUnblacklist(target.id, expiresAt, interaction.guild);
        }

        const duracaoTxt = dias === 0 ? '🔴 Permanente' : `**${dias} dia(s)**`;
        const duracaoTxtDM = dias === 0 ? 'permanente' : `${dias} dia(s)`;
        try {
            await target.send(`🚫 Você recebeu uma blacklist no servidor **${interaction.guild.name}** com duração **${duracaoTxtDM}**.`);
        } catch {}

        const expiraValor = expiresAt
            ? `<t:${Math.floor(expiresAt / 1000)}:F>\n(<t:${Math.floor(expiresAt / 1000)}:R>)`
            : '🔴 Nunca';

        const embed = new EmbedBuilder()
            .setTitle('🚫 BLACKLIST APLICADA')
            .setColor(0xFF0000)
            .setDescription(`<@${target.id}> foi adicionado à blacklist do servidor.`)
            .addFields(
                { name: '👤 Jogador',    value: `<@${target.id}>`,              inline: true },
                { name: '🛡️ Staff',     value: `<@${interaction.user.id}>`,    inline: true },
                { name: '​',            value: '​',                              inline: true },
                { name: '⏳ Duração',    value: duracaoTxt,                      inline: true },
                { name: '📅 Expira em', value: expiraValor,                      inline: true },
            )
            .setThumbnail(target.displayAvatarURL())
            .setFooter({ text: `ID: ${target.id}` })
            .setTimestamp();

        await interaction.followUp({ embeds: [embed] });

        if (interaction.channel.id !== BLACKLIST_LOG_CHANNEL_ID) {
            try {
                const logCh = await interaction.guild.channels.fetch(BLACKLIST_LOG_CHANNEL_ID);
                if (logCh) await logCh.send({ embeds: [embed] });
            } catch {}
        }
    }

    // ── /unblacklist ──────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'unblacklist') {
        if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });

        const target = interaction.options.getUser('player');

        if (!blacklist.has(target.id)) {
            return interaction.reply({ content: "❌ Esse jogador não está na blacklist.", ephemeral: true });
        }

        if (blacklistTimeouts.has(target.id)) {
            clearTimeout(blacklistTimeouts.get(target.id));
            blacklistTimeouts.delete(target.id);
        }

        await applyUnblacklist(target.id, interaction.guild);

        await interaction.reply({ content: `✅ <@${target.id}> foi removido da blacklist e seus cargos foram restaurados.`, ephemeral: true });
    }

    // ── /fechar ───────────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'fechar') {
        if (!perm) return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
        if (!interaction.channel.name.startsWith('teste-')) {
            return interaction.reply({ content: "❌ Este comando só pode ser usado em canais de teste.", ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: false });
        await interaction.followUp({ content: "🔒 Fechando canal em 5 segundos..." });
        setTimeout(() => {
            roundData.delete(interaction.channel.id);
            interaction.channel.delete().catch(() => {});
        }, 5000);
    }
});

// ======================== LEAVE POR TEXTO + ATIVIDADE DO TESTER ========================
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Detecta atividade do tester em canais de teste
    if (message.channel.name?.startsWith('teste-') && message.guild) {
        for (const [roleId, data] of activeTesters) {
            if (data.staffId === message.author.id && data.queue.length > 0) {
                refreshTesterActivity(roleId, message.guild);
                break;
            }
        }
    }

    if (message.channel.id !== LEAVE_TEXT_CHANNEL_ID) return;
    if (!message.content.trim().toLowerCase().startsWith('/leave')) return;

    const userId = message.author.id;
    let removedFrom = null;

    for (const [roleId, data] of activeTesters) {
        const idx = data.queue.indexOf(userId);
        if (idx !== -1) {
            data.queue.splice(idx, 1);
            removedFrom = data.roleName;
            saveData();
            await updateMainEmbed();
            break;
        }
    }

    try { await message.delete(); } catch {}

    if (removedFrom) {
        const reply = await message.channel.send(`<@${userId}> ✅ Você saiu da fila de **${removedFrom}**.`);
        setTimeout(() => reply.delete().catch(() => {}), 5000);
    } else {
        const reply = await message.channel.send(`<@${userId}> ❌ Você não está em nenhuma fila.`);
        setTimeout(() => reply.delete().catch(() => {}), 5000);
    }
});

// ======================== PAINEL DE STATUS ========================
let statusMessage = null;

function createStatusEmbed(online, lastSeen) {
    const embed = new EmbedBuilder()
        .setTitle('📡 STATUS DO BOT')
        .setColor(online ? 0x00FF00 : 0xFF0000)
        .addFields(
            { name: 'Status', value: online ? '🟢 **Online**' : '🔴 **Offline**', inline: true },
            { name: online ? 'Online desde' : 'Último sinal', value: lastSeen, inline: true }
        )
        .setFooter({ text: online ? 'Atualiza a cada 30s' : 'Bot parou de responder' })
        .setTimestamp();
    return embed;
}

function getNow() {
    return new Date().toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

async function updateStatusPanel(online) {
    try {
        if (!statusMessage) return;
        await statusMessage.edit({ embeds: [createStatusEmbed(online, getNow())] });
    } catch {}
}

async function initStatusPanel() {
    try {
        const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
        if (!channel) return;

        let msgId = null;
        if (fs.existsSync(STATUS_MSG_FILE)) {
            msgId = JSON.parse(fs.readFileSync(STATUS_MSG_FILE, 'utf8')).msgId;
        }

        if (msgId) {
            try {
                statusMessage = await channel.messages.fetch(msgId);
            } catch {
                statusMessage = null;
            }
        }

        if (!statusMessage) {
            statusMessage = await channel.send({ embeds: [createStatusEmbed(true, getNow())] });
            fs.writeFileSync(STATUS_MSG_FILE, JSON.stringify({ msgId: statusMessage.id }));
        } else {
            await updateStatusPanel(true);
        }

        setInterval(() => updateStatusPanel(true), 30 * 1000);
    } catch (err) {
        console.error('Erro ao iniciar painel de status:', err.message);
    }
}

async function markOffline() {
    try {
        if (statusMessage) {
            await statusMessage.edit({ embeds: [createStatusEmbed(false, getNow())] });
        }
    } catch {}
}

process.on('SIGTERM', async () => {
    await markOffline();
    setTimeout(() => process.exit(0), 1500);
});

process.on('SIGINT', async () => {
    await markOffline();
    setTimeout(() => process.exit(0), 1500);
});

client.once('ready', async () => {
    console.log(`🚀 Bot Online: ${client.user.tag}`);

    await initStatusPanel();

    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
    if (guild) {
        for (const [userId, entry] of blacklist) {
            if (entry.expiresAt && Date.now() >= entry.expiresAt) {
                await applyUnblacklist(userId, guild);
            } else if (entry.expiresAt) {
                scheduleUnblacklist(userId, entry.expiresAt, guild);
            }
        }
    }
});

client.login(TOKEN);