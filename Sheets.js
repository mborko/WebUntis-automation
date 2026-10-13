/**
 * Google Sheets Integration for WebUntis
 *
 * Collects the teaching content ("Lehrstoff") and homework ("Hausübung") of past lessons
 * and sends them to the spreadsheet web app (SheetWebApp.js, bound to the class spreadsheet),
 * which writes them into the sheet. This project itself needs no access to any spreadsheet.
 *
 * Google Apps Script: syncLessonsToSheet()
 * Node.js: syncLessonsToSheetNodejs()
 */

/**
 * Send lesson entries to the spreadsheet web app
 * Works in Google Apps Script (UrlFetchApp) and Node.js (fetch)
 *
 * @param {Object} sheetConfig - Sheet configuration with webAppUrl and secret
 * @param {Array} entries - Entries from api.getLessonSheetEntries()
 * @param {Object} teachers - Teacher names per subject from api.getSubjectTeachers()
 * @param {boolean} overwrite - Replace the cells with the WebUntis data instead of appending (default: false)
 * @returns {Promise<Object>} Result of the web app: written, unchanged, skipped, unmatched
 */
async function sendLessonEntriesToWebApp(sheetConfig, entries, teachers = {}, overwrite = false) {
    const body = JSON.stringify({ secret: sheetConfig.secret, entries, teachers, overwrite });
    let status;
    let responseText;

    // Apps Script answers with a redirect to the result, which both clients follow automatically
    if (typeof UrlFetchApp !== 'undefined') {
        const response = UrlFetchApp.fetch(sheetConfig.webAppUrl, {
            method: 'post',
            contentType: 'text/plain;charset=utf-8',
            payload: body,
            muteHttpExceptions: true
        });
        status = response.getResponseCode();
        responseText = response.getContentText();
    } else {
        const response = await fetch(sheetConfig.webAppUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body
        });
        status = response.status;
        responseText = await response.text();
    }

    let result;
    try {
        result = JSON.parse(responseText);
    } catch (error) {
        throw new Error(`Unexpected web app response (status ${status}) - check webAppUrl and the deployment access settings: ${responseText.substring(0, 200)}`);
    }

    if (!result.success) {
        throw new Error(`Web app error: ${result.error}`);
    }
    if (overwrite && result.overwrite !== true) {
        throw new Error('The deployed web app does not support overwriting, missing parts were only appended - deploy the current SheetWebApp.js as new version');
    }
    return result;
}

/**
 * Collect the data for the spreadsheet; the timetable is fetched only once for both parts
 *
 * @param {WebUntisAPI} api - Authenticated API instance
 * @param {number} daysBack - Number of days to look back for Lehrstoff and Hausübung
 * @param {Object} options - What to collect
 * @param {boolean} options.lessons - Collect Lehrstoff and Hausübung (default: true)
 * @param {boolean} options.teachers - Collect the teacher names (default: true)
 * @param {boolean} options.overwrite - Only used by the sync functions: replace the cells instead of appending
 * @returns {Promise<Object>} { entries, teachers }
 */
async function collectSheetData(api, daysBack, options = {}) {
    const opts = { lessons: true, teachers: true, ...options };

    // The regular teacher of a subject is determined from (at least) the last 4 weeks
    const lessons = await api.getPastLessons(opts.teachers ? Math.max(daysBack, 28) : daysBack);
    const entries = opts.lessons ? await api.getLessonSheetEntries(daysBack, lessons) : [];
    const teachers = opts.teachers ? await api.getSubjectTeachers(lessons) : {};
    api.constructor.logVerbose(`Sending ${entries.length} entries and ${Object.keys(teachers).length} teacher names to the web app`);
    return { entries, teachers };
}

/**
 * Log what the web app did per cell (only with verbose logging)
 * The per-cell details are only returned by a SheetWebApp.gs deployment that includes them
 *
 * @param {Object} result - Result of sendLessonEntriesToWebApp()
 * @param {Function} log - Logging function, e.g. WebUntisAPI.logVerbose
 */
function logSheetResultDetails(result, log) {
    const details = result.details || {};
    (details.written || []).forEach(cell => log(`Written: ${cell.subject} ${cell.date}: ${cell.text.replace(/\n/g, ' | ')}`));
    (details.unchanged || []).forEach(cell => log(`Unchanged (already in sheet): ${cell.subject} ${cell.date}`));
    (details.skipped || []).forEach(cell => log(`Skipped (no tab for subject): ${cell.subject} ${cell.date}`));
    (details.unmatched || []).forEach(cell => log(`No matching cell: ${cell.subject} ${cell.date}`));
    (details.teachers || []).forEach(teacher => log(`Teacher name added: ${teacher.subject}: ${teacher.teacher}`));

    if (!result.details && result.skippedSubjects && result.skippedSubjects.length > 0) {
        log(`Subjects without a tab (skipped): ${result.skippedSubjects.join(', ')}`);
    }
}

/**
 * Format the result of the web app as a single log line
 * @param {Object} result - Result of sendLessonEntriesToWebApp()
 * @param {Object} options - Same options as for collectSheetData()
 * @returns {string} Summary
 */
function formatSheetResult(result, options = {}) {
    const parts = [];
    if (options.lessons !== false) {
        parts.push(`${result.written} written, ${result.unchanged} unchanged, ${result.skipped} skipped, ${result.unmatched} without matching cell`);
    }
    if (options.teachers !== false) {
        parts.push(`${result.teachersWritten || 0} teacher names added`);
    }
    return parts.join(', ');
}

/**
 * Sync Lehrstoff and Hausübung of the last N days to the spreadsheet
 * Google Apps Script version - use as-is
 * For Node.js version, see syncLessonsToSheetNodejs()
 *
 * @param {Object} config - WebUntis configuration object
 * @param {Object} sheetConfig - Sheet configuration with webAppUrl and secret
 * @param {number} daysBack - Number of days to look back (default: 7)
 * @param {Object} options - { lessons, teachers, overwrite }, see collectSheetData()
 * @returns {Promise<Object>} Sync result
 */
async function syncLessonsToSheet(config, sheetConfig, daysBack = 7, options = {}) {
    try {
        const api = await getWebUntisApiInstance(config);
        const { entries, teachers } = await collectSheetData(api, daysBack, options);
        const result = await sendLessonEntriesToWebApp(sheetConfig, entries, teachers, options.overwrite === true);

        logSheetResultDetails(result, WebUntisAPI.logVerbose);
        console.log(`Sheet sync done: ${formatSheetResult(result, options)}`);
        await clearWebUntisApiInstance();
        return result;
    } catch (error) {
        console.error('Sheet sync error:', error.toString());
        await clearWebUntisApiInstance();
        return { success: false, error: error.toString() };
    }
}

/**
 * Sync Lehrstoff and Hausübung of the last N days to the spreadsheet
 * Node.js version - collects the data locally, the web app writes it to the sheet
 *
 * @param {Object} config - WebUntis configuration object
 * @param {Object} sheetConfig - Sheet configuration with webAppUrl and secret
 * @param {number} daysBack - Number of days to look back (default: 7)
 * @param {Object} options - { lessons, teachers, overwrite }, see collectSheetData()
 * @returns {Promise<Object>} Sync result returned by the web app
 */
async function syncLessonsToSheetNodejs(config, sheetConfig, daysBack = 7, options = {}) {
    const { getWebUntisApiInstance, WebUntisAPI } = require('./WebUntis.js');

    const api = await getWebUntisApiInstance(config);
    const { entries, teachers } = await collectSheetData(api, daysBack, options);
    const result = await sendLessonEntriesToWebApp(sheetConfig, entries, teachers, options.overwrite === true);
    logSheetResultDetails(result, WebUntisAPI.logVerbose);
    return result;
}

// Export functions for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        syncLessonsToSheetNodejs,
        sendLessonEntriesToWebApp,
        formatSheetResult
    };
}
