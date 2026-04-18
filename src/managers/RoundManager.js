'use strict';

const {
    ROUND_EXPIRE_MS,
    TESTER_INACTIVE_MS,
    COOLDOWN_MS,
    ROUND_CLEANUP_INTERVAL_MS,
} = require('../utils/constants');

class RoundManager {
    constructor() {
        this.roundData = new Map();
        this.highRoundData = new Map();
    }

    getRoundData(channelId) {
        return this.roundData.get(channelId);
    }

    setRoundData(channelId, data) {
        this.roundData.set(channelId, data);
    }

    getHighRoundData(channelId) {
        return this.highRoundData.get(channelId);
    }

    setHighRoundData(channelId, data) {
        this.highRoundData.set(channelId, data);
    }

    deleteRoundData(channelId) {
        this.roundData.delete(channelId);
    }

    deleteHighRoundData(channelId) {
        this.highRoundData.delete(channelId);
    }

    updateLastActivity(channelId) {
        const data = this.roundData.get(channelId);
        if (data) {
            data.lastActivity = Date.now();
        }
        const hData = this.highRoundData.get(channelId);
        if (hData) {
            hData.lastActivity = Date.now();
        }
    }

    addRound(channelId, gamesense, mms) {
        const data = this.roundData.get(channelId);
        if (!data) return null;

        const media = (gamesense + mms) / 2;
        data.rounds.push({ gamesense, mms, media });
        data.lastActivity = Date.now();

        return {
            numRound: data.rounds.length,
            media
        };
    }

    addHighRound(channelId, gamesense, mms) {
        const data = this.highRoundData.get(channelId);
        if (!data) return null;

        const media = (gamesense + mms) / 2;
        data.rounds.push({ gamesense, mms, media });
        data.lastActivity = Date.now();

        return {
            numRound: data.rounds.length,
            media
        };
    }

    calculateMediaTier(data) {
        if (!data || data.rounds.length === 0) return 0;
        const soma = data.rounds.reduce((acc, r) => acc + r.media, 0);
        return soma / data.rounds.length;
    }

    hasRounds(channelId) {
        const data = this.roundData.get(channelId);
        return data && data.rounds.length > 0;
    }

    hasHighRounds(channelId) {
        const data = this.highRoundData.get(channelId);
        return data && data.rounds.length > 0;
    }

    isChannelTestChannel(channelId) {
        return this.roundData.has(channelId);
    }

    startCleanupInterval() {
        setInterval(() => {
            const now = Date.now();
            for (const [channelId, data] of this.roundData) {
                if (now - data.lastActivity > ROUND_EXPIRE_MS) {
                    this.roundData.delete(channelId);
                    console.log(`🧹 roundData do canal ${channelId} expirado e removido.`);
                }
            }
            for (const [channelId, data] of this.highRoundData) {
                if (now - data.lastActivity > ROUND_EXPIRE_MS) {
                    this.highRoundData.delete(channelId);
                    console.log(`🧹 highRoundData do canal ${channelId} expirado e removido.`);
                }
            }
        }, ROUND_CLEANUP_INTERVAL_MS);
    }
}

module.exports = new RoundManager();