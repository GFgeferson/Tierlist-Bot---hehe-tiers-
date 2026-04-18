'use strict';

const fs = require('fs');
const {
    DATA_FILE,
    COOLDOWN_FILE,
    BLACKLIST_FILE,
    STATUS_MSG_FILE,
    ROUND_EXPIRE_MS,
    COOLDOWN_MS,
    ROUND_CLEANUP_INTERVAL_MS,
    COOLDOWN_CLEANUP_INTERVAL_MS,
} = require('../utils/constants');

class DataManager {
    constructor() {
        this.activeTesters = new Map();
        this.cooldowns = new Map();
        this.blacklist = new Map();
    }

    initialize() {
        if (fs.existsSync(DATA_FILE)) {
            const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            this.activeTesters = new Map(Object.entries(saved));
        }

        if (fs.existsSync(COOLDOWN_FILE)) {
            const saved = JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8'));
            this.cooldowns = new Map(Object.entries(saved));
        }

        if (fs.existsSync(BLACKLIST_FILE)) {
            const saved = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));
            this.blacklist = new Map(Object.entries(saved));
        }

        this.startCleanupIntervals();
    }

    saveData() {
        fs.writeFileSync(DATA_FILE, JSON.stringify(Object.fromEntries(this.activeTesters), null, 2));
    }

    saveCooldowns() {
        fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(Object.fromEntries(this.cooldowns), null, 2));
    }

    saveBlacklist() {
        fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(Object.fromEntries(this.blacklist), null, 2));
    }

    startCleanupIntervals() {
        setInterval(() => {
            const now = Date.now();
            for (const [, data] of this.roundData) {
                if (now - data.lastActivity > ROUND_EXPIRE_MS) {
                    this.roundData.delete(channelId);
                }
            }
        }, ROUND_CLEANUP_INTERVAL_MS);

        setInterval(() => {
            const now = Date.now();
            let removed = 0;
            for (const [key, expiresAt] of this.cooldowns) {
                if (now > expiresAt) {
                    this.cooldowns.delete(key);
                    removed++;
                }
            }
            if (removed > 0) {
                this.saveCooldowns();
            }
        }, COOLDOWN_CLEANUP_INTERVAL_MS);
    }
}

module.exports = new DataManager();