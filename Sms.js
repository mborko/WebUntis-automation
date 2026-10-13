/**
 * SMS Integration for WebUntis
 *
 * Sends the open homework as SMS from your own Android phone with the open-source app
 * "SMS Gateway for Android" (https://sms-gate.app): the app offers a REST API and sends the SMS
 * with the phone's SIM card, so the SMS costs whatever your tariff charges.
 *
 * Setup:
 * 1. Install the app on an Android phone that stays switched on, start it in Cloud mode
 * 2. Copy username and password from the Home tab of the app to SMS_CONFIG
 *
 * Google Apps Script: sendHomeworkSms()
 * Node.js: sendHomeworkSmsNodejs()
 */

// Messages that could not be sent within 12 hours (e.g. phone offline) are dropped instead of arriving late
const SMS_TTL_SECONDS = 12 * 60 * 60;

/**
 * Send a text to all recipients via the SMS gateway app
 * Works in Google Apps Script (UrlFetchApp) and Node.js (fetch)
 *
 * @param {Object} smsConfig - SMS configuration with url, username, password, phoneNumbers and simNumber
 * @param {string} text - SMS text, long texts are split into several SMS by the phone
 * @returns {Promise<Object>} Gateway response, e.g. { id, status }
 */
async function sendSmsViaGateway(smsConfig, text) {
    const message = {
        phoneNumbers: smsConfig.phoneNumbers,
        textMessage: { text },
        ttl: SMS_TTL_SECONDS
    };
    if (smsConfig.simNumber) {
        message.simNumber = smsConfig.simNumber;
    }
    const body = JSON.stringify(message);
    const credentials = `${smsConfig.username}:${smsConfig.password}`;
    let status;
    let responseText;

    if (typeof UrlFetchApp !== 'undefined') {
        const response = UrlFetchApp.fetch(smsConfig.url, {
            method: 'post',
            contentType: 'application/json',
            headers: { Authorization: `Basic ${Utilities.base64Encode(credentials)}` },
            payload: body,
            muteHttpExceptions: true
        });
        status = response.getResponseCode();
        responseText = response.getContentText();
    } else {
        const response = await fetch(smsConfig.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${Buffer.from(credentials).toString('base64')}`
            },
            body
        });
        status = response.status;
        responseText = await response.text();
    }

    let result = {};
    try {
        result = JSON.parse(responseText);
    } catch (error) {
        // Error pages are not JSON, the status is reported below
    }

    if (status < 200 || status >= 300) {
        throw new Error(`SMS gateway error (status ${status}): ${result.message || result.error || responseText.substring(0, 200)}`);
    }
    return result;
}

/**
 * Build the homework SMS and send it
 *
 * @param {WebUntisAPI} api - Authenticated API instance
 * @param {Object} smsConfig - SMS configuration
 * @returns {Promise<Object>} { sent, homeworkCount, recipients, parts }
 */
async function sendHomeworkSmsWithApi(api, smsConfig) {
    const WebUntis = api.constructor;
    const days = smsConfig.daysAhead || 3;
    const { homeworkList } = await api.getSchoolUpdate(days);
    const text = api.formatHomeworkSms(homeworkList, days, smsConfig.language || 'de');
    const recipients = smsConfig.phoneNumbers || [];

    if (!text) {
        return { sent: false, homeworkCount: 0, recipients, parts: 0 };
    }

    const parts = WebUntis.countSmsParts(text);
    WebUntis.logVerbose(`SMS text (${text.length} characters, ${parts} SMS parts):\n${text}`);

    const result = await sendSmsViaGateway(smsConfig, text);
    WebUntis.logVerbose(`SMS queued on the phone for ${recipients.join(', ')} (id ${result.id}, status ${result.status})`);
    return { sent: true, homeworkCount: homeworkList.length, recipients, parts };
}

/**
 * Send the open homework as SMS
 * Google Apps Script version - use as-is
 * For Node.js version, see sendHomeworkSmsNodejs()
 *
 * @param {Object} config - WebUntis configuration object
 * @param {Object} smsConfig - SMS configuration
 * @returns {Promise<Object>} { sent, homeworkCount, recipients, parts } or { success: false, error }
 */
async function sendHomeworkSms(config, smsConfig) {
    try {
        const api = await getWebUntisApiInstance(config);
        const result = await sendHomeworkSmsWithApi(api, smsConfig);
        console.log(result.sent
            ? `SMS sent to ${result.recipients.join(', ')} (${result.homeworkCount} homework, ${result.parts} SMS parts)`
            : 'No open homework - SMS not sent');
        return result;
    } catch (error) {
        console.error('SMS error:', error.toString());
        return { success: false, error: error.toString() };
    }
}

/**
 * Send the open homework as SMS
 * Node.js version
 *
 * @param {Object} config - WebUntis configuration object
 * @param {Object} smsConfig - SMS configuration
 * @returns {Promise<Object>} { sent, homeworkCount, recipients, parts }
 */
async function sendHomeworkSmsNodejs(config, smsConfig) {
    const { getWebUntisApiInstance } = require('./WebUntis.js');

    const api = await getWebUntisApiInstance(config);
    return await sendHomeworkSmsWithApi(api, smsConfig);
}

// Export functions for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sendHomeworkSmsNodejs,
        sendSmsViaGateway
    };
}
