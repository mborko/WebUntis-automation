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
 * @returns {Promise<Object>} Result of the web app: written, unchanged, skipped, unmatched
 */
async function sendLessonEntriesToWebApp(sheetConfig, entries, teachers = {}) {
    const body = JSON.stringify({ secret: sheetConfig.secret, entries, teachers });
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
 * @returns {Promise<Object>} { entries, teachers }
 */
async function collectSheetData(api, daysBack, options = {}) {
    const opts = { lessons: true, teachers: true, ...options };

    // The regular teacher of a subject is determined from (at least) the last 4 weeks
    const lessons = await api.getPastLessons(opts.teachers ? Math.max(daysBack, 28) : daysBack);
    const entries = opts.lessons ? await api.getLessonSheetEntries(daysBack, lessons) : [];
    const teachers = opts.teachers ? await api.getSubjectTeachers(lessons) : {};
    return { entries, teachers };
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
 * @param {Object} options - { lessons, teachers }, see collectSheetData()
 * @returns {Promise<Object>} Sync result
 */
async function syncLessonsToSheet(config, sheetConfig, daysBack = 7, options = {}) {
    try {
        const api = await getWebUntisApiInstance(config);
        const { entries, teachers } = await collectSheetData(api, daysBack, options);
        const result = await sendLessonEntriesToWebApp(sheetConfig, entries, teachers);

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
 * @param {Object} options - { lessons, teachers }, see collectSheetData()
 * @returns {Promise<Object>} Sync result returned by the web app
 */
async function syncLessonsToSheetNodejs(config, sheetConfig, daysBack = 7, options = {}) {
    const { getWebUntisApiInstance } = require('./WebUntis.js');

    const api = await getWebUntisApiInstance(config);
    const { entries, teachers } = await collectSheetData(api, daysBack, options);
    return await sendLessonEntriesToWebApp(sheetConfig, entries, teachers);
}

// Export functions for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        syncLessonsToSheetNodejs,
        sendLessonEntriesToWebApp,
        formatSheetResult
    };
}
