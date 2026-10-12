/**
 * Node.js Starter for WebUntis Automation
 * 
 * This file demonstrates how to use the WebUntis API in a Node.js environment
 * with proper imports and configuration for email, calendar, Google Sheet and Home Assistant integration.
 * 
 * Instructions:
 * 1. Install dependencies: npm install
 * 2. Copy config.template.js to config.js and add your credentials
 * 3. Run: node StartNode.js
 */

// Import for Node.js
const { WebUntisAPI, getWebUntisApiInstance, clearWebUntisApiInstance } = require('./WebUntis.js');
const { sendHomeworkEmailNodejs, syncHomeworkToCalendarNodejs, syncTimetableToCalendarNodejs } = require('./Google.js');
const { sendHomeworkToHomeAssistant } = require('./HomeAssistant.js');
const { syncLessonsToSheetNodejs } = require('./Sheets.js');

// ==========================================
// CONFIGURATION (loaded from config.js)
// ==========================================

let config;
try {
    config = require('./config.js');
} catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('config.js')) {
        console.error('❌ config.js not found. Copy config.template.js to config.js and add your credentials.');
        process.exit(1);
    }
    throw error;
}

const { UNTIS_CONFIG, HA_CONFIG, CALENDAR_CONFIG, MAIL_NOTIFICATION_CONFIG, SHEET_CONFIG = {} } = config;

// Placeholder detection matches the values used in config.template.js
const isPlaceholder = (value) => !value || /YOUR_|your-|sender-email@/.test(value);

const isUntisConfigured = () => !isPlaceholder(UNTIS_CONFIG.school);

const isEmailConfigured = () =>
    MAIL_NOTIFICATION_CONFIG.enabled &&
    !isPlaceholder(MAIL_NOTIFICATION_CONFIG.email) &&
    MAIL_NOTIFICATION_CONFIG.emailConfig &&
    !isPlaceholder(MAIL_NOTIFICATION_CONFIG.emailConfig.user);

const isCalendarConfigured = () => {
    const credentials = CALENDAR_CONFIG.calendarCredentials;
    return Boolean(credentials) &&
        (!isPlaceholder(credentials.private_key) || !isPlaceholder(credentials.refreshToken));
};

const isHomeAssistantConfigured = () => !isPlaceholder(HA_CONFIG.url) && !isPlaceholder(HA_CONFIG.token);

const isSheetConfigured = () => !isPlaceholder(SHEET_CONFIG.webAppUrl) && !isPlaceholder(SHEET_CONFIG.secret);

// ==========================================
// STARTER FUNCTIONS
// ==========================================

/**
 * Node.js Starter - Complete automation setup
 * Run this function to set up all your automated workflows
 */
async function StartNode() {
    console.log('🚀 Starting Node.js WebUntis Automation...');
    
    try {
        // 1. Test basic API connection
        console.log('1️⃣ Testing WebUntis API connection...');
        const api = await getWebUntisApiInstance(UNTIS_CONFIG);
        const homework = await api.getFormattedHomework(MAIL_NOTIFICATION_CONFIG.homeworkDaysAhead, true);
        console.log('✅ WebUntis API connection successful!');
        console.log('📚 Sample homework:', homework.substring(0, 100) + '...');
        
        // 2. Send homework email notification (Node.js version)
        console.log('\n2️⃣ Sending homework email notification...');
        if (isEmailConfigured()) {
            try {
                await sendHomeworkEmailNodejs(UNTIS_CONFIG, MAIL_NOTIFICATION_CONFIG.email, MAIL_NOTIFICATION_CONFIG.homeworkDaysAhead, MAIL_NOTIFICATION_CONFIG.titlePrefix, MAIL_NOTIFICATION_CONFIG.emailConfig);
                console.log('✅ Homework email sent successfully!');
            } catch (error) {
                console.log('⚠️ Email sending failed:', error.message);
            }
        } else {
            console.log('⚠️ Email not configured - skipping email notification');
            console.log('💡 Tip: Configure MAIL_NOTIFICATION_CONFIG.email and MAIL_NOTIFICATION_CONFIG.emailConfig');
        }
        
        // 3. Sync homework to Google Calendar (Node.js version)
        console.log('\n3️⃣ Syncing homework to Google Calendar...');
        if (isCalendarConfigured()) {
            try {
                const result = await syncHomeworkToCalendarNodejs(
                    UNTIS_CONFIG, 
                    CALENDAR_CONFIG.calendarCredentials, 
                    CALENDAR_CONFIG.homework.syncDaysAhead, // Use configured days
                    { 
                        calendarId: CALENDAR_CONFIG.homework.calendarId,
                        createAsTask: true,
                        reminderDaysBefore: 1 
                    }
                );
                console.log('✅ Homework synced to calendar successfully!');
                console.log(`📊 Results: ${result.added} added, ${result.updated} updated`);
            } catch (error) {
                console.log('⚠️ Calendar sync failed:', error.message);
            }
        } else {
            console.log('⚠️ Google Calendar not configured - skipping calendar sync');
            console.log('💡 Tip: Configure CALENDAR_CONFIG.calendarCredentials');
        }
        
        // 4. Send Home Assistant notification
        console.log('\n4️⃣ Sending Home Assistant notification...');
        if (isHomeAssistantConfigured()) {
            try {
                await sendHomeworkToHomeAssistant(UNTIS_CONFIG, HA_CONFIG, HA_CONFIG.daysAheadNotifications, {
                    title: 'WebUntis Homework Update',
                    includeDetails: true
                });
                console.log('✅ Home Assistant notification sent successfully!');
            } catch (error) {
                console.log('⚠️ Home Assistant notification failed:', error.message);
            }
        } else {
            console.log('⚠️ Home Assistant not configured - skipping HA notification');
            console.log('💡 Tip: Configure HA_CONFIG.url and HA_CONFIG.token');
        }
        
        // 5. Sync timetable to Google Calendar (Node.js version)
        console.log('\n5️⃣ Syncing timetable to Google Calendar...');
        if (isCalendarConfigured()) {
            try {
                // Get timetable for configured days ahead
                const today = new Date();
                const endDate = new Date();
                endDate.setDate(today.getDate() + CALENDAR_CONFIG.timetable.syncDaysAhead);
                
                const timetableData = await api.getTimetableData(today, endDate);
                if (timetableData) {
                    const lessons = api.processTimetableData(timetableData, {
                        skipCancelled: false,
                        includeNotes: true
                    });
                    
                    if (lessons && lessons.length > 0) {
                        const result = await syncTimetableToCalendarNodejs(
                            lessons,
                            CALENDAR_CONFIG.calendarCredentials,
                            {
                                calendarId: CALENDAR_CONFIG.timetable.calendarId,
                                deleteOldEvents: false,
                                eventColor: null
                            }
                        );
                        console.log(`✅ Timetable sync successful! ${result.added} added, ${result.updated} updated, ${result.deleted} deleted`);
                    } else {
                        console.log(`📅 No timetable lessons found for the next ${CALENDAR_CONFIG.timetable.syncDaysAhead} days`);
                    }
                } else {
                    console.log('📅 No timetable data available');
                }
            } catch (error) {
                console.log('⚠️ Timetable sync failed:', error.message);
            }
        } else {
            console.log('⚠️ Google Calendar not configured - skipping timetable sync');
        }
        
        // 6. Write Lehrstoff and Hausübung to the class spreadsheet
        console.log('\n6️⃣ Syncing Lehrstoff and Hausübung to Google Sheet...');
        if (isSheetConfigured()) {
            try {
                const result = await syncLessonsToSheetNodejs(UNTIS_CONFIG, SHEET_CONFIG, SHEET_CONFIG.syncDaysBack);
                console.log(`✅ Sheet sync successful! ${result.written} written, ${result.unchanged} unchanged, ${result.skipped} skipped, ${result.unmatched} without matching cell, ${result.teachersWritten || 0} teacher names added`);
            } catch (error) {
                console.log('⚠️ Sheet sync failed:', error.message);
            }
        } else {
            console.log('⚠️ Google Sheet not configured - skipping sheet sync');
            console.log('💡 Tip: Configure SHEET_CONFIG.webAppUrl and SHEET_CONFIG.secret');
        }
        
        console.log('\n🎉 Node.js automation completed successfully!');
        console.log('💡 Tip: Set up a cron job or scheduled task to run this automatically');
        
        // Clean up
        await clearWebUntisApiInstance();
        
    } catch (error) {
        console.error('❌ Node.js automation failed:', error.toString());
        await clearWebUntisApiInstance();
    }
}

/**
 * Simple test function to verify everything is working
 */
async function testNodeSetup() {
    console.log('🔍 Testing Node.js setup...');
    
    try {
        // Test WebUntis API
        const api = await getWebUntisApiInstance(UNTIS_CONFIG);
        const homework = await api.getFormattedHomework(1, true);
        console.log('✅ WebUntis API test passed');
        
        // Test configuration
        console.log('\n📋 Configuration Status:');
        console.log(`   WebUntis: ${isUntisConfigured() ? '✅' : '❌'} Configured`);
        console.log(`   Email: ${isEmailConfigured() ? '✅' : '❌'} Configured`);
        console.log(`   Calendar: ${isCalendarConfigured() ? '✅' : '❌'} Configured`);
        console.log(`   Homework Calendar: ${CALENDAR_CONFIG.homework.calendarId ? '📅 Custom' : '📅 Default'} (${CALENDAR_CONFIG.homework.syncDaysAhead} days ahead)`);
        console.log(`   Timetable Calendar: ${CALENDAR_CONFIG.timetable.calendarId ? '📅 Custom' : '📅 Default'} (${CALENDAR_CONFIG.timetable.syncDaysAhead} days ahead)`);
        console.log(`   Home Assistant: ${isHomeAssistantConfigured() ? '✅' : '❌'} Configured`);
        console.log(`   Google Sheet: ${isSheetConfigured() ? '✅' : '❌'} Configured`);
        
        await clearWebUntisApiInstance();
        console.log('\n🎉 Node.js setup test completed!');
        
    } catch (error) {
        console.error('❌ Node.js setup test failed:', error.toString());
        await clearWebUntisApiInstance();
    }
}

/**
 * Quick homework check function
 */
async function quickHomeworkCheck() {
    console.log('📚 Quick homework check...');
    
    try {
        const api = await getWebUntisApiInstance(UNTIS_CONFIG);
        const daysAhead = MAIL_NOTIFICATION_CONFIG.homeworkDaysAhead;
        const homework = await api.getFormattedHomework(daysAhead, true);
        console.log(`\n📋 Homework for next ${daysAhead} days:`);
        console.log(homework);
        
        await clearWebUntisApiInstance();
        
    } catch (error) {
        console.error('❌ Homework check failed:', error.toString());
        await clearWebUntisApiInstance();
    }
}

/**
 * Sync Lehrstoff and Hausübung to the class spreadsheet only
 * @param {number} daysBack - Number of days to look back (default: SHEET_CONFIG.syncDaysBack)
 */
async function syncSheet(daysBack = SHEET_CONFIG.syncDaysBack || 7) {
    console.log(`📝 Syncing Lehrstoff and Hausübung of the last ${daysBack} days to Google Sheet...`);
    
    if (!isSheetConfigured()) {
        console.error('❌ Google Sheet not configured - set SHEET_CONFIG.webAppUrl and SHEET_CONFIG.secret in config.js');
        return;
    }
    
    try {
        const result = await syncLessonsToSheetNodejs(UNTIS_CONFIG, SHEET_CONFIG, daysBack);
        console.log(`✅ Sheet sync successful! ${result.written} written, ${result.unchanged} unchanged, ${result.skipped} skipped, ${result.unmatched} without matching cell, ${result.teachersWritten || 0} teacher names added`);
    } catch (error) {
        console.error('❌ Sheet sync failed:', error.toString());
    }
    await clearWebUntisApiInstance();
}

// ==========================================
// EXPORTS AND EXECUTION
// ==========================================

// Export functions for use as module
module.exports = {
    StartNode,
    testNodeSetup,
    quickHomeworkCheck,
    syncSheet,
    UNTIS_CONFIG,
    HA_CONFIG,
    CALENDAR_CONFIG,
    MAIL_NOTIFICATION_CONFIG,
    SHEET_CONFIG
};

// Auto-run if called directly
if (require.main === module) {
    console.log('🚀 WebUntis Node.js Automation Starter');
    console.log('📝 Available commands:');
    console.log('   node StartNode.js test     - Test setup');
    console.log('   node StartNode.js quick    - Quick homework check');
    console.log('   node StartNode.js sheet [days] - Sync Lehrstoff/HÜ to Google Sheet');
    console.log('   node StartNode.js start    - Run full automation');
    console.log('');
    
    const command = process.argv[2] || 'start';
    
    switch (command.toLowerCase()) {
        case 'test':
            testNodeSetup();
            break;
        case 'quick':
            quickHomeworkCheck();
            break;
        case 'sheet':
            syncSheet(process.argv[3] ? parseInt(process.argv[3], 10) : undefined);
            break;
        case 'start':
        default:
            StartNode();
            break;
    }
}