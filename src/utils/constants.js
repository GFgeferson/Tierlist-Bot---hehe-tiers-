'use strict';

const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data.json');
const COOLDOWN_FILE = path.join(__dirname, '../../cooldowns.json');
const BLACKLIST_FILE = path.join(__dirname, '../../blacklist.json');
const STATUS_MSG_FILE = path.join(__dirname, '../../status_msg.json');

const ROUND_EXPIRE_MS = 60 * 60 * 1000;
const TESTER_INACTIVE_MS = 15 * 60 * 1000;
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const QUEUE_NOTIFY_INTERVAL_MS = 60 * 1000;
const EMPTY_QUEUE_TIMEOUT_MS = 30 * 60 * 1000;
const STATUS_UPDATE_INTERVAL_MS = 30 * 1000;
const ROUND_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const COOLDOWN_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

module.exports = {
    DATA_FILE,
    COOLDOWN_FILE,
    BLACKLIST_FILE,
    STATUS_MSG_FILE,
    ROUND_EXPIRE_MS,
    TESTER_INACTIVE_MS,
    COOLDOWN_MS,
    QUEUE_NOTIFY_INTERVAL_MS,
    EMPTY_QUEUE_TIMEOUT_MS,
    STATUS_UPDATE_INTERVAL_MS,
    ROUND_CLEANUP_INTERVAL_MS,
    COOLDOWN_CLEANUP_INTERVAL_MS,
};