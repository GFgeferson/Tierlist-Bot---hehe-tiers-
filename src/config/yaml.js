'use strict';

const yaml = require('yaml');
const fs = require('fs');

const arquivo = fs.readFileSync('./config.yaml', 'utf-8');
const config = yaml.parse(arquivo);

module.exports = {
    TOKEN: config.TOKEN,
    CLIENT_ID: config.CLIENT_ID,
    GUILD_ID: config.GUILD_ID,
    CATEGORY_TICKETS_ID: config.CATEGORY_TICKETS_ID,
    UNRANKED_ROLE_ID: config.UNRANKED_ROLE_ID,
    TESTADO_ROLE_ID: config.TESTADO_ROLE_ID,
    PING_ROLE_IDS: config.PING_ROLE_IDS ?? [],
    ALLOWED_ROLE_IDS: config.ALLOWED_ROLE_IDS ?? [],
    BLACKLIST_RETURN_ROLES: config.BLACKLIST_RETURN_ROLES ?? [],
    BLACKLIST_ROLE_ID: config.BLACKLIST_ROLE_ID,
    HIGH_RESULT_CHANNEL_ID: config.HIGH_RESULT_CHANNEL_ID,
    BLACKLIST_LOG_CHANNEL_ID: config.BLACKLIST_LOG_CHANNEL_ID,
    RESULT_LOG_CHANNEL_ID: config.RESULT_LOG_CHANNEL_ID,
    LEAVE_TEXT_CHANNEL_ID: config.LEAVE_TEXT_CHANNEL_ID,
    STATUS_CHANNEL_ID: config.STATUS_CHANNEL_ID
};