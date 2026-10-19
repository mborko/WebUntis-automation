/**
 * Google Apps Script Starter for WebUntis Automation
 * 
 * This file provides complete automation setup for Google Apps Script environment.
 * 
 * Instructions:
 * 1. Copy WebUntis.js, Google.js and Sheets.js content to a new Google Apps Script project
 *    (SheetWebApp.js goes into a separate script bound to the class spreadsheet)
 * 2. Update the config objects below. Secrets (passwords, tokens, phone numbers) are NOT in this file:
 *    add them under Project Settings → Script Properties with the names used in getScriptProperty() below
 * 3. Run runDaily() for complete automation (email + calendar sync + sheet sync + SMS)
 *    OR run individual functions like quickTest() for testing
 *
 * Main Functions:
 * - runDaily() - Complete daily automation workflow
 * - sendNotifications() - Email homework reminders
 * - syncHomework() - Sync homework to calendar
 * - syncTimetable() - Sync timetable to calendar
 * - syncSheet() - Write Lehrstoff and Hausübung to the class spreadsheet
 * - sendSms() - Open homework as SMS via own Android phone (skipped if SMS_CONFIG is not set)
 * - backfillSheet() - Same as syncSheet() for the whole school year
 * - quickTest() - Test WebUntis API connection
 */

// Script property (Project Settings → Script Properties) or empty string if not set
function getScriptProperty(name) {
    return PropertiesService.getScriptProperties().getProperty(name) || '';
}

// WebUntis Configuration
const UNTIS_CONFIG = {
    school: '<YOUR_SCHOOL_NAME>',           // Your school identifier from WebUntis URL
    username: getScriptProperty('WEBUNTIS_USERNAME'), // Script property WEBUNTIS_USERNAME
    password: getScriptProperty('WEBUNTIS_PASSWORD'), // Script property WEBUNTIS_PASSWORD
    server: '<YOUR_WEBUNTIS_SERVER>',       // Usually something like 'demo.webuntis.com' or 'your-school.webuntis.com'
    resourceId: '<YOUR_STUDENT_RESOURCE_ID>' // Your student resource ID (found in timetable URL, usually a number)
};


const HA_CONFIG = {
    url: '<YOUR_HOME_ASSISTANT_URL>',              // Replace with your Home Assistant URL
    token: getScriptProperty('HA_TOKEN'),          // Script property HA_TOKEN (long-lived access token)
    service: 'notify.signal_me',                   // Replace with your notification service
    daysAheadNotifications: 3,                     // How many days ahead to check for homework notifications
    language: 'de',                                // Language of the notification: 'de' or 'en'
};

const MAIL_NOTIFICATION_CONFIG = {
    enabled: true,                                 // Set to false to disable email notifications
    email: '<YOUR_EMAIL@gmail.com>',               // Your email address for notifications
    homeworkDaysAhead: 3,                          // How many days ahead to check for homework in email notifications
    language: 'de',                                // Language of the email: 'de' or 'en'
    titlePrefix: null,                             // Optional prefix for email subject (e.g., "📚 School:", "Student Name:")
    emailConfig: null                              // Not needed for Google Apps Script (uses built-in Gmail)
};

const CALENDAR_CONFIG = {
    // Homework configuration
    homework: {
        calendarId: null,                          // null for default calendar, or specific calendar ID for homework
        syncDaysAhead: 14,                         // How many days ahead to sync homework (default: 14 days)
    },
    
    // Timetable configuration
    timetable: {
        calendarId: null,                          // null for default calendar, or specific calendar ID for timetable/lectures
        syncDaysAhead: 7,                          // How many days ahead to sync timetable/lectures (default: 7 days)
    },
};

const SHEET_CONFIG = {
    webAppUrl: '<YOUR_SHEET_WEB_APP_URL>',         // /exec URL of SheetWebApp.gs deployed in the class spreadsheet
    secret: getScriptProperty('SHEET_SECRET'),     // Script property SHEET_SECRET, must match SHEET_WEB_APP_SECRET in SheetWebApp.gs
    syncDaysBack: 7,                               // How many days back to sync Lehrstoff and Hausübung
    schoolYearStart: '2026-09-07',                 // Used by backfillSheet()
};

// Open homework as SMS from your own Android phone with the app "SMS Gateway for Android" (https://sms-gate.app)
// Not configured (no SMS_GATEWAY_USERNAME script property) = sendSms() is skipped
const SMS_CONFIG = {
    url: 'https://api.sms-gate.app/3rdparty/v1/messages', // Cloud mode of the app
    username: getScriptProperty('SMS_GATEWAY_USERNAME'),  // Shown on the Home tab of the app
    password: getScriptProperty('SMS_GATEWAY_PASSWORD'),  // Shown on the Home tab of the app
    // Script property SMS_PHONE_NUMBERS, comma-separated, international format (e.g. +43664...)
    phoneNumbers: getScriptProperty('SMS_PHONE_NUMBERS').split(',').map(number => number.trim()).filter(Boolean),
    daysAhead: 3,                                  // Open homework of the next N days
    language: 'de',                                // Language of the SMS: 'de' or 'en'
    simNumber: null,                               // SIM slot (1-3) for dual SIM phones, null = setting of the app
};


function runDaily(){
    //Step 1: Notify about homework
    sendNotifications();

    //Step 2: Sync the homework
    syncCalendar();

    //Step 3: Write Lehrstoff and Hausübung to the class spreadsheet
    syncSheet();

    //Step 4: Send open homework as SMS (skipped if not configured)
    sendSms();
}

function sendNotifications() {
  console.log('Sending notifications...');
  sendHomeworkEmail(UNTIS_CONFIG, MAIL_NOTIFICATION_CONFIG.email, MAIL_NOTIFICATION_CONFIG.homeworkDaysAhead, MAIL_NOTIFICATION_CONFIG.titlePrefix, MAIL_NOTIFICATION_CONFIG.language);
}

function syncCalendar(){

    //Step 2.1: Sync the homework
    syncHomework();

    //Step 2.2: Sync timetable
    syncTimetable();

}

function syncHomework(){
  console.log('Syncing homework to calendar...');
  syncHomeworkToCalendar(UNTIS_CONFIG, CALENDAR_CONFIG.homework.calendarId, CALENDAR_CONFIG.homework.syncDaysAhead);
}

function syncTimetable(){
  console.log('Syncing timetable to calendar...');
    syncTimetableToCalendarWorkflow(UNTIS_CONFIG, CALENDAR_CONFIG.timetable.calendarId, CALENDAR_CONFIG.timetable.syncDaysAhead);
}

function sendSms(){
  if (!SMS_CONFIG.username || !SMS_CONFIG.password || SMS_CONFIG.phoneNumbers.length === 0) {
    console.log('SMS not configured (script properties SMS_GATEWAY_USERNAME, SMS_GATEWAY_PASSWORD, SMS_PHONE_NUMBERS) - skipped');
    return;
  }
  sendHomeworkSms(UNTIS_CONFIG, SMS_CONFIG);
}

function syncSheet(){
  console.log('Syncing Lehrstoff and Hausübung to spreadsheet...');
  syncLessonsToSheet(UNTIS_CONFIG, SHEET_CONFIG, SHEET_CONFIG.syncDaysBack);
}

function backfillSheet(){
  // Many requests (one per lesson) - if this hits the 6 minute limit, temporarily change schoolYearStart and run it in parts
  const daysBack = Math.ceil((new Date() - new Date(SHEET_CONFIG.schoolYearStart)) / (24 * 60 * 60 * 1000));
  console.log(`Backfilling the last ${daysBack} days to spreadsheet...`);
  syncLessonsToSheet(UNTIS_CONFIG, SHEET_CONFIG, daysBack);
}


function quickTest() {
    console.log('Starting WebUntis API test...');
    // Test with the new parameterized function
    testWebUntisAPI(UNTIS_CONFIG).catch(error => console.error('WebUntis test failed:', error.toString()));
}


/**
 * Test: Send Home Assistant notification with homework summary
 */
async function homeAssistantNotification() {
    console.log('Testing Home Assistant homework notification...');
    
    try {
        // Get homework list for next 2 days
        const api = await getWebUntisApiInstance(UNTIS_CONFIG);
        const homeworkList = await api.getHomeworkList(2, true); // Next 2 days, open only
        
        // Only send notification if homework exists
        if (homeworkList.length > 0) {
            const homeworkSummary = api.formatHomework(homeworkList, 2, true);
            
            // Send notification using callHomeAssistantAPI with telegram_bot.send_message
            const result = await callHomeAssistantAPI(HA_CONFIG, 'telegram_bot.send_message', {
                config_entry_id: '<YOUR_TELEGRAM_CONFIG_ID>',
                message: homeworkSummary,
                target: '<YOUR_TELEGRAM_CHAT_ID>'
            });
            
            if (result.success) {
                console.log('Home Assistant notification sent successfully');
                console.log('Notification details:', result.data);
                console.log(`Found ${homeworkList.length} homework assignments`);
            } else {
                console.error('Failed to send Home Assistant notification:', result.error);
            }
        } else {
            console.log('No homework found for the next 2 days - notification not sent');
        }

        // Clean up session
        await clearWebUntisApiInstance();

    } catch (error) {
        console.error('Test failed:', error.toString());
        await clearWebUntisApiInstance();
    }
}



