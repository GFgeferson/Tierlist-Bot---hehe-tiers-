'use strict';

const fs = require('fs');
const { STATUS_MSG_FILE, STATUS_UPDATE_INTERVAL_MS } = require('../utils/constants');

class StatusPanelManager {
    constructor() {
        this.statusMessage = null;
    }

    async initialize(client, channelId) {
        if (!channelId) return;

        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel) return;

            let msgId = null;
            if (fs.existsSync(STATUS_MSG_FILE)) {
                msgId = JSON.parse(fs.readFileSync(STATUS_MSG_FILE, 'utf8')).msgId;
            }

            if (msgId) {
                try {
                    this.statusMessage = await channel.messages.fetch(msgId);
                } catch {
                    this.statusMessage = null;
                }
            }

            if (!this.statusMessage) {
                this.statusMessage = await channel.send({ embeds: [this.createEmbed(true, this.getNow())] });
                this.saveMsgId();
            } else {
                await this.update(true);
            }

            setInterval(() => this.update(true), STATUS_UPDATE_INTERVAL_MS);
        } catch (err) {
            console.error('Erro ao iniciar painel de status:', err.message);
        }
    }

    getNow() {
        return new Date().toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    }

    createEmbed(online, lastSeen) {
        const { EmbedBuilder } = require('discord.js');
        return new EmbedBuilder()
            .setTitle('📡 STATUS DO BOT')
            .setColor(online ? 0x00FF00 : 0xFF0000)
            .addFields(
                { name: 'Status', value: online ? '🟢 **Online**' : '🔴 **Offline**', inline: true },
                { name: online ? 'Online desde' : 'Último sinal', value: lastSeen, inline: true }
            )
            .setFooter({ text: online ? 'Atualiza a cada 30s' : 'Bot parou de responder' })
            .setTimestamp();
    }

    async update(online) {
        try {
            if (!this.statusMessage) return;
            await this.statusMessage.edit({ embeds: [this.createEmbed(online, this.getNow())] });
        } catch {}
    }

    saveMsgId() {
        if (this.statusMessage) {
            fs.writeFileSync(STATUS_MSG_FILE, JSON.stringify({ msgId: this.statusMessage.id }));
        }
    }

    async markOffline() {
        await this.update(false);
    }
}

module.exports = new StatusPanelManager();