/**
 * Google Apps Script Starter for WebUntis Automation
 * 
 * This file provides complete automation setup for Google Apps Script environment.
 * 
 * Instructions:
 * 1. Copy WebUntis.js, Google.js and Sheets.js content to a new Google Apps Script project
 *    (SheetWebApp.js goes into a separate script bound to the class spreadsheet)
 * 2. Update the config objects below with your credentials
 * 3. Run runDaily() for complete automation (email + calendar sync + sheet sync)
 *    OR run individual functions like quickTest() for testing
 * 
 * Main Functions:
 * - runDaily() - Complete daily automation workflow
 * - sendNotifications() - Email homework reminders
 * - syncHomework() - Sync homework to calendar
 * - syncTimetable() - Sync timetable to calendar
 * - syncSheet() - Write Lehrstoff and Hausübung to the class spreadsheet
 * - backfillSheet() - Same as syncSheet() for the whole school year
 * - quickTest() - Test WebUntis API connection
 */

// WebUntis Configuration
const UNTIS_CONFIG = {
    school: '<YOUR_SCHOOL_NAME>',           // Your school identifier from WebUntis URL
    username: '<YOUR_USERNAME>',            // Your WebUntis username
    password: '<YOUR_PASSWORD>',            // Your WebUntis password
    server: '<YOUR_WEBUNTIS_SERVER>',       // Usually something like 'demo.webuntis.com' or 'your-school.webuntis.com'
    resourceId: '<YOUR_STUDENT_RESOURCE_ID>' // Your student resource ID (found in timetable URL, usually a number)
};


const HA_CONFIG = {
    url: '<YOUR_HOME_ASSISTANT_URL>',              // Replace with your Home Assistant URL
    token: '<YOUR_HA_ACCESS_TOKEN>',              // Replace with your long-lived access token
    service: 'notify.signal_me',                   // Replace with your notification service
    daysAheadNotifications: 3,                     // How many days ahead to check for homework notifications
};

const MAIL_NOTIFICATION_CONFIG = {
    enabled: true,                                 // Set to false to disable email notifications
    email: '<YOUR_EMAIL@gmail.com>',               // Your email address for notifications
    homeworkDaysAhead: 3,                          // How many days ahead to check for homework in email notifications
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
    secret: '<CHOOSE_A_LONG_RANDOM_SECRET>',  // Must match SHEET_WEB_APP_SECRET in SheetWebApp.gs
    syncDaysBack: 7,                               // How many days back to sync Lehrstoff and Hausübung
    schoolYearStart: '2026-09-07',                 // Used by backfillSheet()
};


function runDaily(){
    //Step 1: Notify about homework
    sendNotifications();
  
    //Step 2: Sync the homework
    syncCalendar();

    //Step 3: Write Lehrstoff and Hausübung to the class spreadsheet
    syncSheet();
}

function sendNotifications() {
  console.log('🔔 Sending notifications...');
  sendHomeworkEmail(UNTIS_CONFIG, MAIL_NOTIFICATION_CONFIG.email, MAIL_NOTIFICATION_CONFIG.homeworkDaysAhead, MAIL_NOTIFICATION_CONFIG.titlePrefix);
}

function syncCalendar(){

    //Step 2.1: Sync the homework
    syncHomework();

    //Step 2.2: Sync timetable
    syncTimetable();

}

function syncHomework(){
  console.log('📚 Syncing homework to calendar...');
  syncHomeworkToCalendar(UNTIS_CONFIG, CALENDAR_CONFIG.homework.calendarId, CALENDAR_CONFIG.homework.syncDaysAhead);
}

function syncTimetable(){
  console.log('📅 Syncing timetable to calendar...');
    syncTimetableToCalendarWorkflow(UNTIS_CONFIG, CALENDAR_CONFIG.timetable.calendarId, CALENDAR_CONFIG.timetable.syncDaysAhead);
}

function syncSheet(){
  console.log('📝 Syncing Lehrstoff and Hausübung to spreadsheet...');
  syncLessonsToSheet(UNTIS_CONFIG, SHEET_CONFIG, SHEET_CONFIG.syncDaysBack);
}

function backfillSheet(){
  // Many requests (one per lesson) - if this hits the 6 minute limit, temporarily change schoolYearStart and run it in parts
  const daysBack = Math.ceil((new Date() - new Date(SHEET_CONFIG.schoolYearStart)) / (24 * 60 * 60 * 1000));
  console.log(`📝 Backfilling the last ${daysBack} days to spreadsheet...`);
  syncLessonsToSheet(UNTIS_CONFIG, SHEET_CONFIG, daysBack);
}


function quickTest() {
    console.log('🚀 Starting WebUntis API test...');
    // Test with the new parameterized function
    testWebUntisAPI(UNTIS_CONFIG);
}


/**
 * Test: Send Home Assistant notification with homework summary
 */
function homeAssistantNotification() {
    console.log('🏠 Testing Home Assistant homework notification...');
    
    try {
        // Get homework list for next 2 days
        const api = getWebUntisApiInstance(UNTIS_CONFIG);
        const homeworkList = api.getHomeworkList(2, true); // Next 2 days, open only
        
        // Only send notification if homework exists
        if (homeworkList) {
            const homeworkSummary = api.formatHomework(homeworkList, 2, true);
            
            // Send notification using callHomeAssistantAPI with telegram_bot.send_message
            const result = callHomeAssistantAPI(HA_CONFIG, 'telegram_bot.send_message', {
                config_entry_id: '<YOUR_TELEGRAM_CONFIG_ID>',
                message: homeworkSummary,
                target: '<YOUR_TELEGRAM_CHAT_ID>'
            });
            
            if (result.success) {
                console.log('✅ Home Assistant notification sent successfully!');
                console.log('📱 Notification details:', result.data);
                console.log(`📚 Found ${homeworkList.length} homework assignments`);
            } else {
                console.error('❌ Failed to send Home Assistant notification:', result.error);
            }
        } else {
            console.log('😎 No homework found for the next 2 days - notification not sent');
        }
        
        // Clean up session
        clearWebUntisApiInstance();
        
    } catch (error) {
        console.error('❌ Test failed:', error.toString());
        clearWebUntisApiInstance();
    }
}



