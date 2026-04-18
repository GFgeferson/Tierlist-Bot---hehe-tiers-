'use strict';

const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const fs = require('fs');

const {
    TOKEN,
    CLIENT_ID,
    GUILD_ID,
    UNRANKED_ROLE_ID,
    TESTADO_ROLE_ID,
    BLACKLIST_ROLE_ID,
    BLACKLIST_RETURN_ROLES,
    RESULT_LOG_CHANNEL_ID,
    HIGH_RESULT_CHANNEL_ID,
} = require('./config/yaml');

const {
    DATA_FILE,
    COOLDOWN_FILE,
    ROUND_EXPIRE_MS,
    COOLDOWN_MS,
    ROUND_CLEANUP_INTERVAL_MS,
} = require('./utils/constants');

const CommandFactory = require('./utils/CommandFactory');
const InteractionHandler = require('./handlers/InteractionHandler');
const MessageHandler = require('./handlers/MessageHandler');
const BlacklistManager = require('./managers/BlacklistManager');
const StatusPanelManager = require('./managers/StatusPanelManager');
const RoundManager = require('./managers/RoundManager');
const QueueManager = require('./managers/QueueManager');

const { STATUS_CHANNEL_ID } = require('./config/yaml');

class BotClient {
    constructor() {
        this.client = null;
        this.cooldowns = new Map();
    }

    async start() {
        this.loadData();

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers,
            ]
        });

        this.client.cooldowns = this.cooldowns;

        await this.registerCommands();

        BlacklistManager.initialize(BLACKLIST_ROLE_ID, BLACKLIST_RETURN_ROLES);
        RoundManager.startCleanupInterval();

        this.setupEventListeners();

        this.client.login(TOKEN);
    }

    loadData() {
        if (fs.existsSync(DATA_FILE)) {
            const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            const map = new Map(Object.entries(saved));
            for (const [roleId, data] of map) {
                QueueManager.setTesterActive(roleId, data);
            }
        }

        if (fs.existsSync(COOLDOWN_FILE)) {
            const saved = JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8'));
            this.cooldowns = new Map(Object.entries(saved));
        }
    }

    saveData() {
        fs.writeFileSync(DATA_FILE, JSON.stringify(Object.fromEntries(QueueManager.getActiveTesters()), null, 2));
    }

    saveCooldowns() {
        fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(Object.fromEntries(this.cooldowns), null, 2));
    }

    async registerCommands() {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        const commands = CommandFactory.buildCommands();

        try {
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
            console.log('✅ Comandos registrados!');
        } catch (err) {
            console.error('Erro ao registrar comandos:', err);
        }
    }

    setupEventListeners() {
        this.client.on('interactionCreate', async (interaction) => {
            await InteractionHandler.handle(interaction);
        });

        this.client.on('messageCreate', async (message) => {
            await MessageHandler.handle(message);
        });

        this.client.once('ready', async () => {
            console.log(`🚀 Bot Online: ${this.client.user.tag}`);

            await StatusPanelManager.initialize(this.client, STATUS_CHANNEL_ID);
            this.scheduleBlacklistChecks();
        });

        process.on('SIGTERM', async () => {
            await StatusPanelManager.markOffline();
            setTimeout(() => process.exit(0), 1500);
        });

        process.on('SIGINT', async () => {
            await StatusPanelManager.markOffline();
            setTimeout(() => process.exit(0), 1500);
        });
    }

    async scheduleBlacklistChecks() {
        const guild = await this.client.guilds.fetch(GUILD_ID).catch(() => null);
        if (!guild) return;

        for (const [userId, entry] of BlacklistManager.getAll()) {
            if (entry.expiresAt && Date.now() >= entry.expiresAt) {
                await BlacklistManager.applyUnblacklist(userId, guild);
            } else if (entry.expiresAt) {
                BlacklistManager.scheduleUnblacklist(userId, entry.expiresAt, guild);
            }
        }
    }
}

module.exports = new BotClient();