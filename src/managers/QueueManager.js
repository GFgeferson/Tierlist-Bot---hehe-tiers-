'use strict';

const {
    TESTER_INACTIVE_MS,
    COOLDOWN_MS,
    QUEUE_NOTIFY_INTERVAL_MS,
    EMPTY_QUEUE_TIMEOUT_MS,
} = require('../utils/constants');

class QueueManager {
    constructor() {
        this.activeTesters = new Map();
        this.queueNotifyIntervals = new Map();
        this.emptyQueueTimeouts = new Map();
        this.testerActivityTimeouts = new Map();
        this.testerLastActivity = new Map();
    }

    getActiveTesters() {
        return this.activeTesters;
    }

    getTesterData(roleId) {
        return this.activeTesters.get(roleId);
    }

    setTesterActive(roleId, data) {
        this.activeTesters.set(roleId, data);
    }

    removeTester(roleId) {
        this.activeTesters.delete(roleId);
    }

    clearAllTesters() {
        this.activeTesters.clear();
    }

    addToQueue(roleId, userId) {
        const data = this.activeTesters.get(roleId);
        if (data) {
            data.queue.push(userId);
        }
    }

    removeFromQueue(roleId, userId) {
        const data = this.activeTesters.get(roleId);
        if (data) {
            const idx = data.queue.indexOf(userId);
            if (idx !== -1) {
                data.queue.splice(idx, 1);
            }
        }
    }

    isInQueue(roleId, userId) {
        const data = this.activeTesters.get(roleId);
        return data ? data.queue.includes(userId) : false;
    }

    isTesterActive(roleId) {
        return this.activeTesters.has(roleId);
    }

    addPlayerToAnyQueue(userId) {
        for (const [roleId, data] of this.activeTesters) {
            const idx = data.queue.indexOf(userId);
            if (idx !== -1) {
                data.queue.splice(idx, 1);
                return data.roleName;
            }
        }
        return null;
    }

    startQueueNotify(roleId, client, staffIdCallback) {
        this.stopQueueNotify(roleId);

        const interval = setInterval(async () => {
            const data = this.activeTesters.get(roleId);
            if (!data || data.queue.length === 0) {
                this.stopQueueNotify(roleId);
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
        }, QUEUE_NOTIFY_INTERVAL_MS);

        this.queueNotifyIntervals.set(roleId, interval);
    }

    stopQueueNotify(roleId) {
        if (this.queueNotifyIntervals.has(roleId)) {
            clearInterval(this.queueNotifyIntervals.get(roleId));
            this.queueNotifyIntervals.delete(roleId);
        }
    }

    startEmptyQueueTimeout(roleId, client, guild, onTimeoutCallback) {
        this.cancelEmptyQueueTimeout(roleId);

        const guildId = guild.id;
        const timeout = setTimeout(async () => {
            const data = this.activeTesters.get(roleId);
            if (!data || data.queue.length > 0) return;

            const freshGuild = await client.guilds.fetch(guildId).catch(() => null);

            if (freshGuild && data.pingMessageId && data.pingChannelId) {
                try {
                    const ch = await freshGuild.channels.fetch(data.pingChannelId);
                    const msg = await ch.messages.fetch(data.pingMessageId);
                    await msg.delete();
                } catch {}
            }

            this.stopQueueNotify(roleId);
            this.activeTesters.delete(roleId);

            if (onTimeoutCallback) {
                onTimeoutCallback(data);
            }

            try {
                const staffUser = await client.users.fetch(data.staffId);
                await staffUser.send(`⏰ Sua fila **${data.roleName}** foi fechada automaticamente por inatividade (30 minutos).`);
            } catch {}

            console.log(`⏰ Fila ${data.roleName} [${roleId}] fechada por inatividade (fila vazia).`);
        }, EMPTY_QUEUE_TIMEOUT_MS);

        this.emptyQueueTimeouts.set(roleId, timeout);
    }

    cancelEmptyQueueTimeout(roleId) {
        if (this.emptyQueueTimeouts.has(roleId)) {
            clearTimeout(this.emptyQueueTimeouts.get(roleId));
            this.emptyQueueTimeouts.delete(roleId);
        }
    }

    startTesterActivityTimeout(roleId, client, guild, onTimeoutCallback) {
        this.cancelTesterActivityTimeout(roleId);
        this.testerLastActivity.set(roleId, Date.now());

        const guildId = guild.id;
        const timeout = setTimeout(async () => {
            const data = this.activeTesters.get(roleId);
            if (!data || data.queue.length === 0) return;

            const freshGuild = await client.guilds.fetch(guildId).catch(() => null);
            if (!freshGuild) return;

            for (const userId of data.queue) {
                try {
                    const user = await client.users.fetch(userId);
                    const { EmbedBuilder } = require('discord.js');
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

            this.stopQueueNotify(roleId);
            this.cancelEmptyQueueTimeout(roleId);
            this.testerLastActivity.delete(roleId);
            this.activeTesters.delete(roleId);

            if (onTimeoutCallback) {
                onTimeoutCallback(data);
            }

            console.log(`😴 Fila ${data.roleName} [${roleId}] fechada por inatividade do tester.`);
        }, TESTER_INACTIVE_MS);

        this.testerActivityTimeouts.set(roleId, timeout);
    }

    cancelTesterActivityTimeout(roleId) {
        if (this.testerActivityTimeouts.has(roleId)) {
            clearTimeout(this.testerActivityTimeouts.get(roleId));
            this.testerActivityTimeouts.delete(roleId);
        }
        this.testerLastActivity.delete(roleId);
    }

    refreshTesterActivity(roleId, guild) {
        if (!this.activeTesters.has(roleId)) return;
        const data = this.activeTesters.get(roleId);
        if (data.queue.length === 0) return;
        this.testerLastActivity.set(roleId, Date.now());
    }

    shutdown(roleId) {
        this.stopQueueNotify(roleId);
        this.cancelEmptyQueueTimeout(roleId);
        this.cancelTesterActivityTimeout(roleId);
    }

    shutdownAll() {
        for (const roleId of this.activeTesters.keys()) {
            this.shutdown(roleId);
        }
    }
}

module.exports = new QueueManager();