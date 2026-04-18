'use strict';

const { LEAVE_TEXT_CHANNEL_ID } = require('../config/yaml');

const PermissionManager = require('../utils/PermissionManager');
const EmbedFactory = require('../utils/EmbedFactory');
const QueueManager = require('../managers/QueueManager');

class MessageHandler {
    constructor() {
        this.interactionHandler = null;
    }

    setInteractionHandler(handler) {
        this.interactionHandler = handler;
    }

    async handle(message) {
        if (message.author.bot) return;

        const activeTesters = QueueManager.getActiveTesters();

        if (message.channel.name?.startsWith('teste-') && message.guild) {
            for (const [roleId, data] of activeTesters) {
                if (data.staffId === message.author.id && data.queue.length > 0) {
                    QueueManager.refreshTesterActivity(roleId, message.guild);
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
                break;
            }
        }

        try {
            await message.delete();
        } catch {}

        if (removedFrom) {
            const reply = await message.channel.send(`<@${userId}> ✅ Você saiu da fila de **${removedFrom}**.`);
            setTimeout(() => reply.delete().catch(() => {}), 5000);
        } else {
            const reply = await message.channel.send(`<@${userId}> ❌ Você não está em nenhuma fila.`);
            setTimeout(() => reply.delete().catch(() => {}), 5000);
        }
    }
}

module.exports = new MessageHandler();