/**
 * Node.js Starter for WebUntis Automation
 * 
 * This file demonstrates how to use the WebUntis API in a Node.js environment
 * with proper imports and configuration for email, calendar, Google Sheet and Home Assistant integration.
 * 
 * Instructions:
 * 1. Install dependencies: npm install
 * 2. Copy config.template.js to config.js and add your credentials
 * 3. Run: node StartNode.js [action ...]  (node StartNode.js help lists the actions)
 */

// Import for Node.js
const { WebUntisAPI, getWebUntisApiInstance, clearWebUntisApiInstance } = require('./WebUntis.js');
const { sendHomeworkEmailNodejs, getEmailRecipients, syncHomeworkToCalendarNodejs, syncTimetableToCalendarNodejs } = require('./Google.js');
const { sendHomeworkToHomeAssistant } = require('./HomeAssistant.js');
const { syncLessonsToSheetNodejs, formatSheetResult } = require('./Sheets.js');
const { sendHomeworkSmsNodejs } = require('./Sms.js');

// ==========================================
// CONFIGURATION (loaded from config.js)
// ==========================================

let config;
try {
    config = require('./config.js');
} catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('config.js')) {
        console.error('config.js not found. Copy config.template.js to config.js and add your credentials.');
        process.exit(1);
    }
    throw error;
}

const { UNTIS_CONFIG, HA_CONFIG, CALENDAR_CONFIG, MAIL_NOTIFICATION_CONFIG, SHEET_CONFIG = {}, SMS_CONFIG = {} } = config;

// Placeholder detection matches the values used in config.template.js
const isPlaceholder = (value) => !value || /YOUR_|your-|sender-email@/.test(value);

const isUntisConfigured = () => !isPlaceholder(UNTIS_CONFIG.school);

const isEmailConfigured = () =>
    MAIL_NOTIFICATION_CONFIG.enabled &&
    getEmailRecipients(MAIL_NOTIFICATION_CONFIG.email).length > 0 &&
    !getEmailRecipients(MAIL_NOTIFICATION_CONFIG.email).some(isPlaceholder) &&
    MAIL_NOTIFICATION_CONFIG.emailConfig &&
    !isPlaceholder(MAIL_NOTIFICATION_CONFIG.emailConfig.user);

const isCalendarConfigured = () => {
    const credentials = CALENDAR_CONFIG.calendarCredentials;
    return Boolean(credentials) &&
        (!isPlaceholder(credentials.private_key) || !isPlaceholder(credentials.refreshToken));
};

const isHomeAssistantConfigured = () => !isPlaceholder(HA_CONFIG.url) && !isPlaceholder(HA_CONFIG.token);

const isSheetConfigured = () => !isPlaceholder(SHEET_CONFIG.webAppUrl) && !isPlaceholder(SHEET_CONFIG.secret);

const isSmsConfigured = () =>
    SMS_CONFIG.enabled !== false &&
    !isPlaceholder(SMS_CONFIG.url) &&
    !isPlaceholder(SMS_CONFIG.username) &&
    !isPlaceholder(SMS_CONFIG.password) &&
    Array.isArray(SMS_CONFIG.phoneNumbers) &&
    SMS_CONFIG.phoneNumbers.length > 0 &&
    !SMS_CONFIG.phoneNumbers.some(number => isPlaceholder(number));

// ==========================================
// STARTER FUNCTIONS
// ==========================================

// ==========================================
// ACTIONS
// ==========================================

/**
 * Available actions; each run() returns a one-line summary or throws.
 * lessons and teachers are written to the sheet with a single request (see runSheet)
 */
const ACTIONS = {
    email: {
        description: 'Send homework email',
        isConfigured: isEmailConfigured,
        hint: 'MAIL_NOTIFICATION_CONFIG.email and emailConfig',
        run: async () => {
            const result = await sendHomeworkEmailNodejs(UNTIS_CONFIG, MAIL_NOTIFICATION_CONFIG.email, MAIL_NOTIFICATION_CONFIG.homeworkDaysAhead, MAIL_NOTIFICATION_CONFIG.titlePrefix, MAIL_NOTIFICATION_CONFIG.emailConfig, MAIL_NOTIFICATION_CONFIG.language);
            return result.sent
                ? `sent to ${result.recipients.length} recipient(s) (${result.homeworkCount} homework, Lehrstoff of ${result.contentCount} subjects)`
                : 'no homework and no Lehrstoff today, not sent';
        }
    },
    homework: {
        description: 'Sync homework to Google Calendar',
        isConfigured: isCalendarConfigured,
        hint: 'CALENDAR_CONFIG.calendarCredentials',
        run: async () => {
            const result = await syncHomeworkToCalendarNodejs(
                UNTIS_CONFIG,
                CALENDAR_CONFIG.calendarCredentials,
                CALENDAR_CONFIG.homework.calendarId || 'primary',
                CALENDAR_CONFIG.homework.syncDaysAhead,
                { createAsTask: true, reminderDaysBefore: 1 }
            );
            if (!result.success) throw new Error(result.error);
            return `${result.added} added, ${result.updated} updated`;
        }
    },
    ha: {
        description: 'Send Home Assistant notification',
        isConfigured: isHomeAssistantConfigured,
        hint: 'HA_CONFIG.url and HA_CONFIG.token',
        run: async () => {
            const result = await sendHomeworkToHomeAssistant(UNTIS_CONFIG, HA_CONFIG, HA_CONFIG.daysAheadNotifications, {
                includeDetails: true
            });
            if (!result.success) throw new Error(result.error);
            return result.homeworkCount > 0 || result.contentCount > 0
                ? `sent (${result.homeworkCount} homework, Lehrstoff of ${result.contentCount} subjects)`
                : 'no homework and no Lehrstoff today, not sent';
        }
    },
    sms: {
        description: 'Send open homework as SMS',
        isConfigured: isSmsConfigured,
        hint: 'SMS_CONFIG.username, password and phoneNumbers',
        run: async () => {
            const result = await sendHomeworkSmsNodejs(UNTIS_CONFIG, SMS_CONFIG);
            return result.sent
                ? `sent to ${result.recipients.length} recipient(s) (${result.homeworkCount} homework, ${result.parts} SMS parts)`
                : 'no homework, not sent';
        }
    },
    timetable: {
        description: 'Sync timetable to Google Calendar',
        isConfigured: isCalendarConfigured,
        hint: 'CALENDAR_CONFIG.calendarCredentials',
        run: async () => {
            const api = await getWebUntisApiInstance(UNTIS_CONFIG);
            const today = new Date();
            const endDate = new Date();
            endDate.setDate(today.getDate() + CALENDAR_CONFIG.timetable.syncDaysAhead);

            const timetableData = await api.getTimetableData(today, endDate);
            const lessons = api.processTimetableData(timetableData, { skipCancelled: false, includeNotes: true });
            if (!lessons) {
                return `no lessons in the next ${CALENDAR_CONFIG.timetable.syncDaysAhead} days`;
            }

            const result = await syncTimetableToCalendarNodejs(
                lessons,
                CALENDAR_CONFIG.calendarCredentials,
                CALENDAR_CONFIG.timetable.calendarId || 'primary'
            );
            if (!result.success) throw new Error(result.error);
            return `${result.added} added, ${result.updated} updated, ${result.deleted} deleted`;
        }
    },
    lessons: {
        description: 'Write Lehrstoff/Hausübung to Google Sheet',
        isConfigured: isSheetConfigured,
        hint: 'SHEET_CONFIG.webAppUrl and SHEET_CONFIG.secret'
    },
    teachers: {
        description: 'Write teacher names to Google Sheet',
        isConfigured: isSheetConfigured,
        hint: 'SHEET_CONFIG.webAppUrl and SHEET_CONFIG.secret'
    }
};

const ALIASES = {
    sheet: ['lessons', 'teachers'],
    all: Object.keys(ACTIONS)
};

/**
 * Write Lehrstoff/Hausübung and/or teacher names to the sheet with one timetable fetch and one request
 * @param {Object} options - { lessons, teachers, overwrite }
 * @param {number} daysBack - Number of days to look back for Lehrstoff and Hausübung
 * @returns {Promise<string>} Summary
 */
async function runSheet(options, daysBack) {
    const result = await syncLessonsToSheetNodejs(UNTIS_CONFIG, SHEET_CONFIG, daysBack, options);
    return formatSheetResult(result, options);
}

/**
 * Run the given actions in a fixed order
 * Explicitly requested actions that are not configured are reported as errors,
 * with "all" they are skipped silently
 *
 * @param {Array<string>} actionNames - Names from ACTIONS or ALIASES
 * @param {Object} options
 * @param {number} options.daysBack - Days back for the sheet (default: SHEET_CONFIG.syncDaysBack or 7)
 * @param {boolean} options.overwrite - Replace the sheet cells with the WebUntis data instead of appending (default: false)
 * @param {boolean} options.skipUnconfigured - Skip unconfigured actions without error (default: false)
 * @returns {Promise<boolean>} true if all actions succeeded
 */
async function runActions(actionNames, options = {}) {
    const daysBack = options.daysBack || SHEET_CONFIG.syncDaysBack || 7;
    const expanded = actionNames.flatMap(name => ALIASES[name] || [name]);
    const unknown = expanded.filter(name => !ACTIONS[name]);
    if (unknown.length > 0) {
        console.error(`Unknown action: ${unknown.join(', ')}`);
        return false;
    }
    const selected = Object.keys(ACTIONS).filter(name => expanded.includes(name));
    let success = true;

    const runnable = selected.filter(name => {
        if (ACTIONS[name].isConfigured()) return true;
        if (options.skipUnconfigured) {
            WebUntisAPI.logVerbose(`${name}: skipped, not configured`);
        } else {
            console.error(`${name}: not configured (set ${ACTIONS[name].hint} in config.js)`);
            success = false;
        }
        return false;
    });

    const sheetOptions = {
        lessons: runnable.includes('lessons'),
        teachers: runnable.includes('teachers'),
        overwrite: options.overwrite === true
    };

    try {
        for (const name of runnable) {
            if (name === 'teachers' && sheetOptions.lessons) continue; // already done together with lessons
            const label = name === 'lessons' && sheetOptions.teachers ? 'sheet' : name;
            try {
                const summary = (name === 'lessons' || name === 'teachers')
                    ? await runSheet(sheetOptions, daysBack)
                    : await ACTIONS[name].run();
                console.log(`${label}: ${summary}`);
            } catch (error) {
                console.error(`${label}: failed - ${error.message}`);
                success = false;
            }
        }
    } finally {
        await clearWebUntisApiInstance();
    }
    return success;
}

/**
 * Run the actions listed in ACTIONS of config.js, or all configured actions if it is not set
 * @param {Object} options - { daysBack, overwrite }, see runActions()
 */
async function StartNode(options = {}) {
    return runActions(config.ACTIONS || ALIASES.all, { ...options, skipUnconfigured: !config.ACTIONS });
}

/**
 * Show the configuration status and test the WebUntis login
 */
async function testNodeSetup() {
    const status = (configured) => configured ? 'configured' : 'not configured';
    console.log(`WebUntis:       ${status(isUntisConfigured())}`);
    console.log(`Email:          ${status(isEmailConfigured())}`);
    console.log(`Calendar:       ${status(isCalendarConfigured())}`);
    console.log(`Home Assistant: ${status(isHomeAssistantConfigured())}`);
    console.log(`Google Sheet:   ${status(isSheetConfigured())}`);
    console.log(`SMS:            ${status(isSmsConfigured())}`);

    try {
        await getWebUntisApiInstance(UNTIS_CONFIG);
        console.log('WebUntis login: ok');
        return true;
    } catch (error) {
        console.error(`WebUntis login: failed - ${error.message}`);
        return false;
    } finally {
        await clearWebUntisApiInstance();
    }
}

/**
 * Print the open homework of the next days
 */
async function quickHomeworkCheck() {
    try {
        const api = await getWebUntisApiInstance(UNTIS_CONFIG);
        console.log(await api.getFormattedHomework(MAIL_NOTIFICATION_CONFIG.homeworkDaysAhead, true, MAIL_NOTIFICATION_CONFIG.language));
        return true;
    } catch (error) {
        console.error(`Homework check failed - ${error.message}`);
        return false;
    } finally {
        await clearWebUntisApiInstance();
    }
}

/**
 * Sync Lehrstoff/Hausübung and teacher names to the class spreadsheet only
 * @param {number} daysBack - Number of days to look back (default: SHEET_CONFIG.syncDaysBack)
 * @param {boolean} overwrite - Replace the cells with the WebUntis data instead of appending (default: false)
 */
async function syncSheet(daysBack, overwrite = false) {
    return runActions(ALIASES.sheet, { daysBack, overwrite });
}

function printUsage() {
    console.log('Usage: node StartNode.js [action ...] [--days N] [--overwrite] [--verbose]');
    console.log('');
    console.log('Actions:');
    Object.entries(ACTIONS).forEach(([name, action]) => console.log(`  ${name.padEnd(10)} ${action.description}`));
    console.log('  sheet      Same as: lessons teachers');
    console.log('  all        All configured actions');
    console.log('  test       Show configuration status and test the WebUntis login');
    console.log('  quick      Print open homework');
    console.log('');
    console.log('Without action, ACTIONS from config.js (or all configured actions) are run.');
    console.log('--days N     Days back for lessons (default: SHEET_CONFIG.syncDaysBack)');
    console.log('--overwrite  Replace the sheet cells (and teacher names) with the WebUntis data instead of appending');
    console.log('--verbose    Detailed logs, e.g. skipped lessons and every sheet/calendar change');
}

/**
 * Parse the command line, e.g. ['lessons', 'teachers', '--days', '30', '--verbose']
 * A bare number is also accepted as days (e.g. "sheet 30")
 * @param {Array<string>} args - Command line arguments
 * @returns {Object} { command, actions, daysBack, verbose, overwrite } or { error }
 */
function parseArgs(args) {
    const actions = [];
    let daysBack;
    let command = null;
    let verbose = false;
    let overwrite = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i].toLowerCase();
        if (arg === '--verbose' || arg === '-v') {
            verbose = true;
        } else if (arg === '--overwrite') {
            overwrite = true;
        } else if (arg === '--days' || arg === '-d') {
            daysBack = parseInt(args[++i], 10);
        } else if (/^\d+$/.test(arg)) {
            daysBack = parseInt(arg, 10);
        } else if (['test', 'quick', 'help', '--help', '-h'].includes(arg)) {
            command = arg.replace(/^-+/, '');
        } else if (arg === 'start') {
            command = 'start';
        } else if (ALIASES[arg]) {
            actions.push(...ALIASES[arg]);
        } else if (ACTIONS[arg]) {
            actions.push(arg);
        } else {
            return { error: `Unknown action: ${args[i]}` };
        }
    }

    if (daysBack !== undefined && !(daysBack > 0)) {
        return { error: '--days needs a positive number' };
    }
    return { command, actions, daysBack, verbose, overwrite, all: args.some(a => a.toLowerCase() === 'all') };
}

// ==========================================
// EXPORTS AND EXECUTION
// ==========================================

// Export functions for use as module
module.exports = {
    StartNode,
    runActions,
    testNodeSetup,
    quickHomeworkCheck,
    syncSheet,
    UNTIS_CONFIG,
    HA_CONFIG,
    CALENDAR_CONFIG,
    MAIL_NOTIFICATION_CONFIG,
    SHEET_CONFIG,
    SMS_CONFIG
};

// Auto-run if called directly
if (require.main === module) {
    const parsed = parseArgs(process.argv.slice(2));
    WebUntisAPI.verbose = Boolean(parsed.verbose);

    let run;
    if (parsed.error) {
        console.error(parsed.error);
        printUsage();
        process.exitCode = 1;
    } else if (parsed.command === 'help' || parsed.command === 'h') {
        printUsage();
    } else if (parsed.command === 'test') {
        run = testNodeSetup();
    } else if (parsed.command === 'quick') {
        run = quickHomeworkCheck();
    } else if (parsed.actions.length > 0) {
        run = runActions(parsed.actions, { daysBack: parsed.daysBack, overwrite: parsed.overwrite, skipUnconfigured: parsed.all });
    } else {
        run = StartNode({ daysBack: parsed.daysBack, overwrite: parsed.overwrite });
    }

    if (run) {
        run.then(success => { if (!success) process.exitCode = 1; });
    }
}
