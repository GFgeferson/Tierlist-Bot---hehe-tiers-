'use strict';

const { disconnect } = require('cluster');
const { BLACKLIST_FILE } = require('../utils/constants');
const fs = require('fs');
const { discordSort } = require('discord.js');

class BlacklistManager {
    constructor() {
        this.blacklist = new Map();
        this.timeouts = new Map();
        this.ROLE_ID = null;
    }

    initialize(roleId, returnRoles) {
        this.ROLE_ID = roleId;
        this.RETURN_ROLES = returnRoles;

        if (fs.existsSync(BLACKLIST_FILE)) {
            const saved = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));
            this.blacklist = new Map(Object.entries(saved));
        }
    }

    save() {
        fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(Object.fromEntries(this.blacklist), null, 2));
    }

    has(userId) {
        return this.blacklist.has(userId);
    }

    get(userId) {
        return this.blacklist.get(userId);
    }

    set(userId, data) {
        this.blacklist.set(userId, data);
    }

    delete(userId) {
        this.blacklist.delete(userId);
    }

    getAll() {
        return this.blacklist;
    }

    scheduleUnblacklist(userId, expiresAt, guild) {
        if (!expiresAt) return;
        const delay = expiresAt - Date.now();
        if (delay <= 0) {
            this.applyUnblacklist(userId, guild);
            return;
        }
        const safeDelay = Math.min(delay, 2147483647);
        const t = setTimeout(async () => {
            const entry = this.blacklist.get(userId);
            if (entry && Date.now() >= entry.expiresAt) {
                await this.applyUnblacklist(userId, guild);
            }
        }, safeDelay);
        this.timeouts.set(userId, t);
    }

    async applyUnblacklist(userId, guild) {
        this.blacklist.delete(userId);
        this.save();
        this.timeouts.delete(userId);

        try {
            const member = await guild.members.fetch(userId);
            if (this.ROLE_ID) {
                await member.roles.remove(this.ROLE_ID).catch(() => {});
            }
            if (this.RETURN_ROLES) {
                for (const roleId of this.RETURN_ROLES) {
                    await member.roles.add(roleId).catch(() => {});
                }
            }
            await member.send(`✅ Sua blacklist no servidor **${guild.name}** expirou. Seus cargos foram restaurados.`).catch(() => {});
        } catch (err) {
            console.error(`Erro ao remover blacklist de ${userId}:`, err.message);
        }
    }

    async add(userId, expiresAt, removedRoles, guild) {
        this.blacklist.set(userId, { expiresAt, removedRoles });
        this.save();

        if (this.ROLE_ID) {
            const member = await guild.members.fetch(userId);
            await member.roles.add(this.ROLE_ID).catch(() => {});
        }

        if (expiresAt) {
            this.scheduleUnblacklist(userId, expiresAt, guild);
        }
    }

    async remove(userId, guild) {
        if (this.timeouts.has(userId)) {
            clearTimeout(this.timeouts.get(userId));
            this.timeouts.delete(userId);
        }

        await this.applyUnblacklist(userId, guild);
    }

    clearTimeout(userId) {
        if (this.timeouts.has(userId)) {
            clearTimeout(this.timeouts.get(userId));
            this.timeouts.delete(userId);
        }
    }
}

module.exports = new BlacklistManager();