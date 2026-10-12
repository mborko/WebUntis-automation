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
 * @returns {Promise<Object>} Result of the web app: written, unchanged, skipped, unmatched
 */
async function sendLessonEntriesToWebApp(sheetConfig, entries) {
    const body = JSON.stringify({ secret: sheetConfig.secret, entries });
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
 * Sync Lehrstoff and Hausübung of the last N days to the spreadsheet
 * Google Apps Script version - use as-is
 * For Node.js version, see syncLessonsToSheetNodejs()
 *
 * @param {Object} config - WebUntis configuration object
 * @param {Object} sheetConfig - Sheet configuration with webAppUrl and secret
 * @param {number} daysBack - Number of days to look back (default: 7)
 * @returns {Promise<Object>} Sync result
 */
async function syncLessonsToSheet(config, sheetConfig, daysBack = 7) {
    try {
        console.log(`📝 Syncing Lehrstoff and Hausübung of the last ${daysBack} days to the spreadsheet...`);

        const api = await getWebUntisApiInstance(config);
        const entries = await api.getLessonSheetEntries(daysBack);
        const result = await sendLessonEntriesToWebApp(sheetConfig, entries);

        console.log(`✅ Sheet sync done! ${result.written} written, ${result.unchanged} unchanged, ${result.skipped} skipped, ${result.unmatched} without matching cell`);
        await clearWebUntisApiInstance();
        return result;
    } catch (error) {
        console.error('⚠️ Sheet sync error:', error.toString());
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
 * @returns {Promise<Object>} Sync result returned by the web app
 */
async function syncLessonsToSheetNodejs(config, sheetConfig, daysBack = 7) {
    const { getWebUntisApiInstance } = require('./WebUntis.js');

    console.log(`📝 Collecting Lehrstoff and Hausübung of the last ${daysBack} days...`);
    const api = await getWebUntisApiInstance(config);
    const entries = await api.getLessonSheetEntries(daysBack);
    console.log(`📤 Sending ${entries.length} entries to the spreadsheet web app...`);

    return await sendLessonEntriesToWebApp(sheetConfig, entries);
}

// Export functions for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        syncLessonsToSheetNodejs,
        sendLessonEntriesToWebApp
    };
}
