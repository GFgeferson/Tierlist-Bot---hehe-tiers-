'use strict';

const { PermissionFlagsBits } = require('discord.js');
const {
    ALLOWED_ROLE_IDS,
} = require('../config/yaml');

class PermissionManager {
    canOperate(member) {
        if (!member) return false;
        if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
        for (const id of ALLOWED_ROLE_IDS) {
            if (member.roles.cache.has(id)) return true;
        }
        return false;
    }

    canOperateForTester(member, activeTesters) {
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
}

module.exports = new PermissionManager();