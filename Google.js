/**
 * Google Services Integration for WebUntis
 * This file contains all Google-specific functionality (Gmail, Calendar) 
 * 
 * For Google Apps Script:
 * - Copy this content to a Google Apps Script project
 * - The functions will work directly with Google's built-in services
 * 
 * For Node.js:
 * - Install required packages: npm install googleapis nodemailer
 * - Set up OAuth2 credentials for Google APIs
 * - Use the Node.js versions of these functions (see README.md)
 */

// ==========================================
// EMAIL FUNCTIONS (Google Apps Script and Node.js)
// ==========================================

/**
 * Collect the open homework and today's Lehrstoff and build the email
 * Shared by the Apps Script and the Node.js version
 *
 * @param {WebUntisAPI} api - Authenticated API instance
 * @param {number} days - Number of days to look ahead for homework
 * @param {string} emailPrefix - Optional prefix for the email subject
 * @param {string} language - 'de' or 'en' (default: 'de')
 * @returns {Promise<Object|null>} { subject, text, html, homeworkCount, contentCount } or null if there is nothing to send
 */
async function createHomeworkEmail(api, days, emailPrefix = null, language = 'de') {
    const WebUntis = api.constructor;
    const texts = WebUntis.getTexts(language);
    const update = await api.getSchoolUpdate(days);
    const { homeworkList, teachingContents } = update;

    if (homeworkList.length === 0 && teachingContents.length === 0) {
        return null;
    }

    const formatDate = (date) => WebUntis.formatDateWithWeekday(date, language);
    const today = formatDate(new Date());
    const subject = `${emailPrefix ? `${emailPrefix} ` : ''}${texts.emailSubject} – ${today}`;

    // HTML version, the plain text version is the same text as in the Home Assistant notification
    const escape = (text) => String(text || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

    let body = `<h1>&#x1F4D6; ${escape(`${texts.contentTitle} (${today})`)}</h1>\n`;
    if (teachingContents.length > 0) {
        teachingContents.forEach(entry => {
            body += `<div class="item"><div class="subject">${escape(entry.subject)}</div>` +
                `<div class="description">${entry.contents.map(escape).join('<br>')}</div></div>\n`;
        });
    } else {
        body += `<p class="empty">${escape(texts.noContent)}</p>\n`;
    }

    body += `<h1>&#x1F4DA; ${escape(texts.homeworkTitle(days))}</h1>\n`;
    if (homeworkList.length > 0) {
        homeworkList.forEach(hw => {
            body += `<div class="item"><div class="subject">&#x1F4CB; ${escape(hw.subjectName)}</div>` +
                (hw.date ? `<div class="assigned-date">&#x1F5D3; ${texts.assigned}: ${formatDate(hw.date)}</div>` : '') +
                `<div class="due-date">&#x1F4C5; ${texts.due}: ${formatDate(hw.dueDate)}</div>` +
                `<div class="description">${escape(hw.text || texts.noDescription)}</div></div>\n`;
        });
    } else {
        body += `<p class="empty">${escape(texts.noHomework)}</p>\n`;
    }

    const html = `<!DOCTYPE html>
<html lang="${language === 'en' ? 'en' : 'de'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; margin: 20px; background-color: #f9f9f9; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; margin: 30px 0 20px; font-size: 22px; }
        h1:first-child { margin-top: 0; }
        .item { background-color: #f8f9fa; border-left: 4px solid #3498db; margin: 16px 0; padding: 16px 20px; border-radius: 8px; }
        .subject { font-weight: bold; font-size: 18px; color: #2c3e50; margin-bottom: 6px; }
        .assigned-date { color: #7f8c8d; font-size: 14px; margin-bottom: 2px; }
        .due-date { color: #e74c3c; font-weight: bold; font-size: 16px; margin-bottom: 10px; }
        .description { color: #555; background-color: white; padding: 10px 12px; border-radius: 4px; border: 1px solid #e9ecef; }
        .empty { color: #7f8c8d; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #ddd; color: #666; font-size: 13px; text-align: center; }
    </style>
</head>
<body>
<div class="container">
${body}<div class="footer"><p>&#x1F916; ${escape(texts.footer)}</p></div>
</div>
</body>
</html>
`;

    return {
        subject,
        text: api.formatSchoolUpdateText(update, days, language),
        html,
        homeworkCount: homeworkList.length,
        contentCount: teachingContents.length
    };
}

/**
 * Send the open homework and today's Lehrstoff by email
 * This function can be set up as a trigger in Google Apps Script
 *
 * For Google Apps Script:
 * - Copy WebUntis.js content to your Google Apps Script project first
 * - Then copy this function
 *
 * For Node.js: Use sendHomeworkEmailNodejs() instead
 *
 * @param {Object} config - WebUntis configuration object
 * @param {string|Array<string>} emailAddress - Recipient address, list of addresses or comma-separated string
 * @param {number} days - Number of days to look ahead (default: 3)
 * @param {string} emailPrefix - Optional prefix for email subject (default: null)
 * @param {string} language - 'de' or 'en' (default: 'de')
 */
async function sendHomeworkEmail(config, emailAddress, days = 3, emailPrefix = null, language = 'de') {
    if (!config) {
        throw new Error('Config parameter is required');
    }

    const recipients = getEmailRecipients(emailAddress);
    if (recipients.length === 0) {
        throw new Error('Email address parameter is required');
    }

    try {
        // Get API instance using the global function from WebUntis.js
        const api = await getWebUntisApiInstance(config);
        const email = await createHomeworkEmail(api, days, emailPrefix, language);

        if (email) {
            GmailApp.sendEmail(recipients.join(','), email.subject, email.text, {
                htmlBody: email.html,
                from: Session.getActiveUser().getEmail()
            });
            console.log(`Email sent to ${recipients.join(', ')} (${email.homeworkCount} homework, Lehrstoff of ${email.contentCount} subjects)`);
        } else {
            console.log(`No homework for the next ${days} days and no Lehrstoff today - email not sent`);
        }

        // Note: We don't logout here as we're reusing the session

    } catch (error) {
        console.error('Error sending homework email:', error.toString());
        throw error;
    }
}

/**
 * Node.js version of sendHomeworkEmail using nodemailer
 * Requires: npm install nodemailer
 *
 * @param {Object} config - WebUntis configuration object
 * @param {string|Array<string>} emailAddress - Recipient address, list of addresses or comma-separated string
 * @param {number} days - Number of days to look ahead (default: 3)
 * @param {string} emailPrefix - Optional prefix for email subject (default: null)
 * @param {Object} emailConfig - Email configuration for nodemailer
 * @param {string} language - 'de' or 'en' (default: 'de')
 * @returns {Promise<Object>} { sent, homeworkCount, contentCount, recipients }
 */
async function sendHomeworkEmailNodejs(config, emailAddress, days = 3, emailPrefix = null, emailConfig, language = 'de') {
    if (!config) {
        throw new Error('Config parameter is required');
    }

    const recipients = getEmailRecipients(emailAddress);
    if (recipients.length === 0) {
        throw new Error('Email address parameter is required');
    }

    if (!emailConfig) {
        throw new Error('Email configuration is required for Node.js version');
    }

    const { getWebUntisApiInstance, WebUntisAPI } = require('./WebUntis.js');
    const api = await getWebUntisApiInstance(config);
    const email = await createHomeworkEmail(api, days, emailPrefix, language);
    if (!email) {
        return { sent: false, homeworkCount: 0, contentCount: 0, recipients };
    }

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport(createMailTransportOptions(emailConfig));
    await transporter.sendMail({
        from: emailConfig.from,
        to: recipients,
        subject: email.subject,
        text: email.text,
        html: email.html
    });

    WebUntisAPI.logVerbose(`Email sent to ${recipients.join(', ')}`);
    return { sent: true, homeworkCount: email.homeworkCount, contentCount: email.contentCount, recipients };
}

/**
 * Normalize the recipients: a single address, a list or a comma/semicolon separated string
 * @param {string|Array<string>} emailAddress - Recipient(s)
 * @returns {Array<string>} Trimmed, non-empty addresses
 */
function getEmailRecipients(emailAddress) {
    const list = Array.isArray(emailAddress) ? emailAddress : String(emailAddress || '').split(/[,;]/);
    return list.map(address => String(address || '').trim()).filter(Boolean);
}

/**
 * Build nodemailer transport options from MAIL_NOTIFICATION_CONFIG.emailConfig
 * nodemailer expects the credentials in "auth", the config has them at the top level
 *
 * @param {Object} emailConfig - { service, user, password, from } or OAuth2 { service, user, clientId, clientSecret, refreshToken }
 * @returns {Object} nodemailer transport options
 */
function createMailTransportOptions(emailConfig) {
    const { user, password, clientId, clientSecret, refreshToken, from, auth, ...transport } = emailConfig;
    if (auth) {
        return { ...transport, auth };
    }
    return {
        ...transport,
        auth: refreshToken
            ? { type: 'OAuth2', user, clientId, clientSecret, refreshToken }
            : { user, pass: password }
    };
}

/**
 * Line in the event description that identifies the homework, so the same homework is found
 * again on the next run even if its text or due date has changed
 * @param {Object} hw - Homework from WebUntis
 * @returns {string}
 */
function homeworkIdMarker(hw) {
    return `WebUntis-ID: ${hw.id}`;
}

/**
 * Find the calendar event of a homework between two dates (Google Apps Script)
 * Events created before homeworkIdMarker() existed are matched by title and text
 * @param {Calendar} calendar - Apps Script calendar
 * @param {Object} hw - Homework from WebUntis
 * @param {string} title - Event title
 * @param {Date} from - Start of the search window
 * @param {Date} to - End of the search window
 * @returns {CalendarEvent|undefined}
 */
function findHomeworkEvent(calendar, hw, title, from, to) {
    const events = calendar.getEvents(from, to);
    return events.find(event => event.getDescription().includes(homeworkIdMarker(hw))) ||
        events.find(event => event.getTitle().includes(title) && event.getDescription().includes(hw.text || 'No description'));
}

/**
 * Add homework to Google Calendar as tasks
 * Creates tasks for the day before the due date instead of events on the due date
 * Google Apps Script version - use as-is
 * For Node.js version, see syncHomeworkToCalendarNodejs()
 * 
 * @param {Object} config - WebUntis configuration object
 * @param {string|null} calendarId - Calendar ID, calendar name, or null for default
 * @param {number} days - Number of days to look ahead (default: 7)
 * @param {Object} options - Additional options for calendar integration
 * @param {string} options.eventColor - Event color (optional)
 * @param {boolean} options.createCalendarIfNotExists - Create calendar if it doesn't exist (default: false)
 * @param {string} options.calendarName - Name for new calendar if creating (default: 'WebUntis Homework')
 * @param {boolean} options.createAsTask - Create as task instead of event (default: true)
 * @param {number} options.reminderDaysBefore - Days before due date to create reminder (default: 1)
 */
async function syncHomeworkToCalendar(config, calendarId = null, days = 7, options = {}) {
    if (!config) {
        throw new Error('Config parameter is required');
    }

    // Set default options
    const opts = {
        eventColor: null,
        createCalendarIfNotExists: false,
        calendarName: 'WebUntis Homework',
        createAsTask: true,
        reminderDaysBefore: 1,
        ...options
    };

    try {
        const api = await getWebUntisApiInstance(config);
        const homeworkData = await api.getHomework(
            WebUntisAPI.formatDate(new Date()),
            WebUntisAPI.formatDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000))
        );
            
        // Get calendar with enhanced logic
        let calendar = null;
        
        if (!calendarId) {
            // Use default calendar
            calendar = CalendarApp.getDefaultCalendar();
            console.log('Using default calendar');
        } else if (calendarId.includes('@')) {
            // Calendar ID provided (email format)
            try {
                calendar = CalendarApp.getCalendarById(calendarId);
                if (calendar) {
                    console.log(`Using calendar by ID: ${calendarId}`);
                }
            } catch (error) {
                console.warn(`Calendar ID ${calendarId} not found or no access`);
            }
        } else {
            // Calendar name provided - search for it
            const calendars = CalendarApp.getAllCalendars();
            calendar = calendars.find(cal => cal.getName() === calendarId);
            if (calendar) {
                console.log(`Found calendar by name: ${calendarId}`);
            }
        }
        
        // If calendar still not found, try to create it or fall back
        if (!calendar) {
            if (opts.createCalendarIfNotExists) {
                try {
                    const calendarName = typeof calendarId === 'string' && !calendarId.includes('@') 
                        ? calendarId 
                        : opts.calendarName;
                    calendar = CalendarApp.createCalendar(calendarName);
                    console.log(`Created new calendar: ${calendarName}`);
                } catch (error) {
                    console.warn('Could not create calendar, using default');
                    calendar = CalendarApp.getDefaultCalendar();
                }
            } else {
                console.warn('Specified calendar not found, using default');
                calendar = CalendarApp.getDefaultCalendar();
            }
        }
        
        if (!calendar) {
            console.error('No calendar available');
            return;
        }
        
        let addedCount = 0;
        let updatedCount = 0;
        
        (homeworkData.homeworks || []).forEach(hw => {
            if (!hw.completed) {
                const dueDate = api.formatWebUntisDate(hw.dueDate);
                const dueDateObj = new Date(dueDate.split('.').reverse().join('-')); // Convert DD.MM.YYYY to Date
                
                // Calculate reminder date (due date - reminderDaysBefore)
                const reminderDate = new Date(dueDateObj);
                reminderDate.setDate(reminderDate.getDate() - opts.reminderDaysBefore);
                
                // Don't create reminders for past dates
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (reminderDate < today) {
                    console.log(`Skipping past reminder date for homework due ${dueDate}`);
                    return;
                }
                
                // Get subject from lessons data
                const lessons = homeworkData.lessons || [];
                const lessonMap = {};
                lessons.forEach(l => {
                    lessonMap[l.id] = l.subject;
                });
                
                const subject = lessonMap[hw.lessonId] || hw.subject || 'Homework';
                
                if (opts.createAsTask) {
                    // Create as task (all-day reminder)
                    const taskTitle = `📝 ${subject} - Due Tomorrow`;
                    const taskNotes = `Subject: ${subject}\nDue Date: ${dueDate}\nReminder: ${opts.reminderDaysBefore} day(s) before due date\n\n${hw.text || 'No description'}\n\n${homeworkIdMarker(hw)}\nAdded by WebUntis API`;

                    // Check if task already exists (search until the due date, so a moved due date is found too)
                    const existingTask = findHomeworkEvent(calendar, hw, taskTitle, today, new Date(dueDateObj.getTime() + 24 * 60 * 60 * 1000));

                    if (!existingTask) {
                        // Create new all-day task/event
                        const eventOptions = {
                            description: taskNotes
                        };
                        
                        // Add color if specified
                        if (opts.eventColor) {
                            eventOptions.color = opts.eventColor;
                        }
                        
                        // Create as all-day event (task-like)
                        const task = calendar.createAllDayEvent(taskTitle, reminderDate, eventOptions);
                        const reminderDateFormatted = api.formatWebUntisDate(parseInt(WebUntisAPI.formatDate(reminderDate)));
                        console.log(`Added task: ${taskTitle} on ${reminderDateFormatted}`);
                        addedCount++;
                    } else {
                        // Update existing task if text, title or reminder date changed
                        const dateChanged = WebUntisAPI.formatDate(existingTask.getAllDayStartDate()) !== WebUntisAPI.formatDate(reminderDate);
                        if (!existingTask.getDescription().includes(taskNotes) || existingTask.getTitle() !== taskTitle || dateChanged) {
                            existingTask.setTitle(taskTitle);
                            existingTask.setDescription(taskNotes);
                            if (dateChanged) existingTask.setAllDayDate(reminderDate);
                            console.log(`Updated task: ${taskTitle}`);
                            updatedCount++;
                        }
                    }
                } else {
                    // Create as event (original behavior - on due date)
                    const title = `📚 ${subject} - Homework Due`;
                    const description = `Subject: ${subject}\nDue: ${dueDate}\n\n${hw.text || 'No description'}\n\n${homeworkIdMarker(hw)}\nAdded by WebUntis API`;

                    // Check if event already exists (search until the due date, so a moved due date is found too)
                    const existingEvent = findHomeworkEvent(calendar, hw, title, today, new Date(dueDateObj.getTime() + 24 * 60 * 60 * 1000));

                    if (!existingEvent) {
                        // Create new event
                        const eventOptions = {
                            description: description
                        };
                        
                        // Add color if specified
                        if (opts.eventColor) {
                            eventOptions.color = opts.eventColor;
                        }
                        
                        const event = calendar.createEvent(title, dueDateObj, dueDateObj, eventOptions);
                        console.log(`Added to calendar: ${title} on ${dueDate}`);
                        addedCount++;
                    } else {
                        // Update existing event if text, title or due date changed
                        const dateChanged = WebUntisAPI.formatDate(existingEvent.getStartTime()) !== WebUntisAPI.formatDate(dueDateObj);
                        if (!existingEvent.getDescription().includes(description) || existingEvent.getTitle() !== title || dateChanged) {
                            existingEvent.setTitle(title);
                            existingEvent.setDescription(description);
                            if (dateChanged) existingEvent.setTime(dueDateObj, dueDateObj);
                            console.log(`Updated calendar event: ${title}`);
                            updatedCount++;
                        }
                    }
                }
            }
        });
        
        console.log(`Calendar sync complete: ${addedCount} added, ${updatedCount} updated`);
        console.log(`Calendar used: ${calendar.getName()}`);
        // Note: We don't logout here as we're reusing the session
        
        return {
            success: true,
            calendar: calendar.getName(),
            calendarId: calendar.getId(),
            added: addedCount,
            updated: updatedCount
        };
        
    } catch (error) {
        console.error('Error adding homework to calendar:', error.toString());
        return {
            success: false,
            error: error.toString()
        };
    }
}

/**
 * Node.js version of syncHomeworkToCalendar using Google Calendar API
 * Requires: npm install googleapis
 * 
 * @param {Object} config - WebUntis configuration object
 * @param {Object} auth - Google OAuth2 client
 * @param {string|null} calendarId - Calendar ID or null for primary
 * @param {number} days - Number of days to look ahead (default: 7)
 * @param {Object} options - Additional options for calendar integration
 * @returns {Promise<Object>} Result object
 */
async function syncHomeworkToCalendarNodejs(config, auth, calendarId = 'primary', days = 7, options = {}) {
    const opts = {
        createAsTask: true,
        reminderDaysBefore: 1,
        ...options
    };

    try {
        const { getWebUntisApiInstance, WebUntisAPI } = require('./WebUntis.js');
        const api = await getWebUntisApiInstance(config);
        const homeworkData = await api.getHomework(
            WebUntisAPI.formatDate(new Date()),
            WebUntisAPI.formatDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000))
        );

        const { google } = require('googleapis');
        const calendar = google.calendar({ version: 'v3', auth });

        let addedCount = 0;
        let updatedCount = 0;

        for (const hw of (homeworkData.homeworks || [])) {
            if (hw.completed) {
                WebUntisAPI.logVerbose(`Skipped completed homework: ${hw.text}`);
            } else {
                const dueDate = api.formatWebUntisDate(hw.dueDate);
                const dueDateObj = new Date(dueDate.split('.').reverse().join('-'));
                
                const reminderDate = new Date(dueDateObj);
                reminderDate.setDate(reminderDate.getDate() - opts.reminderDaysBefore);
                
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (reminderDate < today) {
                    WebUntisAPI.logVerbose(`Skipped homework due ${dueDate} (reminder date passed): ${hw.text}`);
                    continue;
                }

                const lessons = homeworkData.lessons || [];
                const lessonMap = {};
                lessons.forEach(l => {
                    lessonMap[l.id] = l.subject;
                });
                
                const subject = lessonMap[hw.lessonId] || hw.subject || 'Homework';

                const eventData = {
                    summary: `📝 ${subject} - Due Tomorrow`,
                    start: { date: reminderDate.toISOString().split('T')[0] },
                    end: { date: reminderDate.toISOString().split('T')[0] },
                    description: `Subject: ${subject}\nDue Date: ${dueDate}\nReminder: ${opts.reminderDaysBefore} day(s) before due date\n\n${hw.text || 'No description'}\n\nAdded by WebUntis API`
                };

                // Fixed event ID per homework (Google allows only a-v and 0-9): a later run gets 409 and updates the event instead of duplicating it
                const eventId = `untis${hw.id}`;
                try {
                    await calendar.events.insert({
                        calendarId: calendarId,
                        resource: { id: eventId, ...eventData }
                    });
                    WebUntisAPI.logVerbose(`Added: ${eventData.summary} on ${eventData.start.date}`);
                    addedCount++;
                } catch (error) {
                    if (Number(error.code || error.response?.status) !== 409) {
                        console.error(`Error adding homework event ${eventData.summary}: ${error.toString()}`);
                        continue;
                    }
                    try {
                        await calendar.events.update({
                            calendarId: calendarId,
                            eventId: eventId,
                            resource: eventData
                        });
                        WebUntisAPI.logVerbose(`Updated: ${eventData.summary} on ${eventData.start.date}`);
                        updatedCount++;
                    } catch (updateError) {
                        console.error(`Error updating homework event ${eventData.summary}: ${updateError.toString()}`);
                    }
                }
            }
        }

        return {
            success: true,
            added: addedCount,
            updated: updatedCount
        };

    } catch (error) {
        return {
            success: false,
            error: error.toString()
        };
    }
}

// ==========================================
// GOOGLE APPS SCRIPT CALENDAR FUNCTIONS
// ==========================================

/**
 * List all available calendars for the user
 * Google Apps Script version - use as-is
 * For Node.js version, see listAvailableCalendarsNodejs()
 * 
 * @param {boolean} showDetails - Whether to show detailed information (default: false)
 * @returns {Array} Array of calendar objects with name and id
 */
function listAvailableCalendars(showDetails = false) {
    try {
        const calendars = CalendarApp.getAllCalendars();
        const calendarList = [];
        
        console.log('Available Calendars:');
        console.log('========================');
        
        calendars.forEach((calendar, index) => {
            const calendarInfo = {
                name: calendar.getName(),
                id: calendar.getId(),
                isDefault: calendar.getId() === CalendarApp.getDefaultCalendar().getId()
            };
            
            if (showDetails) {
                calendarInfo.description = calendar.getDescription();
                calendarInfo.timeZone = calendar.getTimeZone();
                calendarInfo.color = calendar.getColor();
            }
            
            calendarList.push(calendarInfo);
            
            const defaultLabel = calendarInfo.isDefault ? ' (DEFAULT)' : '';
            console.log(`${index + 1}. ${calendarInfo.name}${defaultLabel}`);
            console.log(`   ID: ${calendarInfo.id}`);
            
            if (showDetails) {
                console.log(`   Description: ${calendarInfo.description || 'None'}`);
                console.log(`   Time Zone: ${calendarInfo.timeZone}`);
                console.log(`   Color: ${calendarInfo.color}`);
            }
            console.log('');
        });
        
        console.log(`Total calendars found: ${calendars.length}`);
        return calendarList;
    } catch (error) {
        console.error('Error listing calendars:', error.toString());
        return [];
    }
}

/**
 * Node.js version of listAvailableCalendars using Google Calendar API
 * Requires: npm install googleapis
 * 
 * @param {Object} auth - Google OAuth2 client
 * @param {boolean} showDetails - Whether to show detailed information (default: false)
 * @returns {Promise<Array>} Array of calendar objects with name and id
 */
async function listAvailableCalendarsNodejs(auth, showDetails = false) {
    try {
        const { google } = require('googleapis');
        const calendar = google.calendar({ version: 'v3', auth });
        
        const response = await calendar.calendarList.list();
        const calendars = response.data.items || [];
        
        console.log('Available Calendars:');
        console.log('========================');
        
        const calendarList = [];
        
        calendars.forEach((cal, index) => {
            const calendarInfo = {
                name: cal.summary,
                id: cal.id,
                isDefault: cal.primary || false
            };
            
            if (showDetails) {
                calendarInfo.description = cal.description;
                calendarInfo.timeZone = cal.timeZone;
                calendarInfo.backgroundColor = cal.backgroundColor;
            }
            
            calendarList.push(calendarInfo);
            
            const defaultLabel = calendarInfo.isDefault ? ' (DEFAULT)' : '';
            console.log(`${index + 1}. ${calendarInfo.name}${defaultLabel}`);
            console.log(`   ID: ${calendarInfo.id}`);
            
            if (showDetails) {
                console.log(`   Description: ${calendarInfo.description || 'None'}`);
                console.log(`   Time Zone: ${calendarInfo.timeZone}`);
                console.log(`   Background Color: ${calendarInfo.backgroundColor}`);
            }
            console.log('');
        });
        
        console.log(`Total calendars found: ${calendars.length}`);
        return calendarList;
    } catch (error) {
        console.error('Error listing calendars:', error.toString());
        return [];
    }
}

/**
 * Sync timetable to Google Calendar (full workflow)
 * Gets timetable data, processes it, and syncs to calendar
 * Google Apps Script version - use as-is
 * For Node.js version, see syncTimetableToCalendarWorkflowNodejs()
 * 
 * @param {Object} config - WebUntis configuration object
 * @param {string|null} calendarId - Calendar ID, calendar name, or null for default
 * @param {number} days - Number of days to look ahead (default: 7)
 * @param {Object} options - Additional options for calendar integration
 */
async function syncTimetableToCalendarWorkflow(config, calendarId = null, days = 7, options = {}) {
    try {
        console.log('Syncing timetable to calendar...');
        
        const api = await getWebUntisApiInstance(config);
        const today = new Date();
        const endDate = new Date();
        endDate.setDate(today.getDate() + days);
        
        const startDateStr = WebUntisAPI.formatDateForAPI(today);
        const endDateStr = WebUntisAPI.formatDateForAPI(endDate);
        
        const timetableData = await api.getTimetableData(startDateStr, endDateStr);
        if (timetableData) {
            const lessons = api.processTimetableData(timetableData, {
                skipCancelled: false,
                includeNotes: true,
                ...options
            });
            
            if (lessons && lessons.length > 0) {
                const result = syncTimetableToCalendar(lessons, calendarId, options);
                if (result.success) {
                    console.log(`Timetable sync successful! ${result.added} added, ${result.updated} updated`);
                    return result;
                } else {
                    console.log('Timetable sync failed:', result.error);
                    return result;
                }
            } else {
                console.log(`No timetable lessons found for the next ${days} days`);
                return { success: true, message: 'No lessons found', added: 0, updated: 0 };
            }
        } else {
            console.log('No timetable data available');
            return { success: true, message: 'No timetable data', added: 0, updated: 0 };
        }
    } catch (error) {
        console.error('Timetable sync error:', error.toString());
        return { success: false, error: error.toString() };
    }
}

/**
 * Sync processed timetable lessons to Google Calendar
 * Google Apps Script version - use as-is
 * For Node.js version, see syncTimetableToCalendarNodejs()
 * 
 * @param {Array} lessons - Processed lesson objects from WebUntis
 * @param {string|null} calendarId - Calendar ID, calendar name, or null for default
 * @param {Object} options - Additional options for calendar integration
 */
function syncTimetableToCalendar(lessons, calendarId = null, options = {}) {
    // Set default options
    const opts = {
        createCalendarIfNotExists: true,
        calendarName: 'WebUntis Timetable',
        updateExisting: true,
        includeNotes: true,
        ...options
    };

    try {
        // Handle null/empty lessons
        if (!lessons || !Array.isArray(lessons) || lessons.length === 0) {
            console.log('No lessons to sync');
            return { 
                success: true, 
                message: 'No lessons found',
                added: 0,
                updated: 0,
                deleted: 0,
                skipped: 0
            };
        }

        console.log(`Syncing ${lessons.length} lessons to calendar...`);

        // Get or create calendar (Google Apps Script specific)
        let calendar = null;
        
        if (!calendarId) {
            calendar = CalendarApp.getDefaultCalendar();
            console.log('Using default calendar');
        } else if (calendarId.includes('@')) {
            try {
                calendar = CalendarApp.getCalendarById(calendarId);
                if (calendar) {
                    console.log(`Using calendar by ID: ${calendarId}`);
                }
            } catch (error) {
                console.warn(`Calendar ID ${calendarId} not found or no access`);
            }
        } else {
            const calendars = CalendarApp.getAllCalendars();
            calendar = calendars.find(cal => cal.getName() === calendarId);
            if (calendar) {
                console.log(`Found calendar by name: ${calendarId}`);
            }
        }
        
        if (!calendar) {
            if (opts.createCalendarIfNotExists) {
                try {
                    const calendarName = typeof calendarId === 'string' && !calendarId.includes('@') 
                        ? calendarId 
                        : opts.calendarName;
                    calendar = CalendarApp.createCalendar(calendarName);
                    console.log(`Created new calendar: ${calendarName}`);
                } catch (error) {
                    console.warn('Could not create calendar, using default');
                    calendar = CalendarApp.getDefaultCalendar();
                }
            } else {
                console.warn('Specified calendar not found, using default');
                calendar = CalendarApp.getDefaultCalendar();
            }
        }
        
        if (!calendar) {
            throw new Error('No calendar available');
        }

        let addedCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;
        let deletedCount = 0;

        // Process each lesson
        lessons.forEach((lesson, index) => {
            try {
                console.log(`Processing lesson ${index + 1}/${lessons.length}: ${lesson.subject}`);

                // Check if event already exists
                const existingEvents = calendar.getEventsForDay(lesson.startTime);
                const existingEvent = existingEvents.find(event => {
                    const eventStart = event.getStartTime();
                    const eventEnd = event.getEndTime();
                    return Math.abs(eventStart.getTime() - lesson.startTime.getTime()) < 60000 && // Within 1 minute
                           Math.abs(eventEnd.getTime() - lesson.endTime.getTime()) < 60000 &&
                           event.getTitle().includes(lesson.subject);
                });

                // Handle cancelled lessons - delete from calendar
                if (lesson.isCancelled) {
                    if (existingEvent) {
                        existingEvent.deleteEvent();
                        console.log(`Deleted cancelled lesson: ${lesson.subject} at ${lesson.startTime.toLocaleTimeString()}`);
                        deletedCount++;
                    } else {
                        console.log(`Skipped cancelled lesson (no existing event): ${lesson.subject}`);
                        skippedCount++;
                    }
                    return;
                }

                // Create event title and description
                let eventTitle = `${lesson.subject}`;
                if (lesson.isExam) {
                    eventTitle = `📝 ${eventTitle} (EXAM)`;
                } else if (lesson.isAdditional) {
                    eventTitle = `➕ ${eventTitle} (ADDITIONAL)`;
                }

                if (lesson.hasHomework) {
                    eventTitle += ' 📚';
                }

                let description = `Subject: ${lesson.subjectLong || lesson.subject}\nTeacher: ${lesson.teacher}`;
                if (lesson.teacherLong && lesson.teacherLong !== lesson.teacher) {
                    description += ` (${lesson.teacherLong})`;
                }
                description += `\nRoom: ${lesson.room}`;
                if (lesson.roomLong && lesson.roomLong !== lesson.room) {
                    description += ` (${lesson.roomLong})`;
                }
                description += `\nType: ${lesson.type}\nStatus: ${lesson.status}`;

                if (lesson.lessonInfo && opts.includeNotes) {
                    description += `\n\nLesson Info: ${lesson.lessonInfo}`;
                }

                if (lesson.notes && opts.includeNotes) {
                    description += `\n\nNotes: ${lesson.notes}`;
                }

                description += `\n\nCreated by WebUntis API`;

                if (existingEvent && opts.updateExisting) {
                    existingEvent.setTitle(eventTitle);
                    existingEvent.setDescription(description);
                    existingEvent.setTime(lesson.startTime, lesson.endTime);
                    console.log(`Updated: ${eventTitle} at ${lesson.startTime.toLocaleTimeString()}`);
                    updatedCount++;
                } else if (!existingEvent) {
                    const eventOptions = { description: description };

                    if (lesson.isExam) {
                        eventOptions.color = CalendarApp.EventColor.RED;
                    } else if (lesson.isAdditional) {
                        eventOptions.color = CalendarApp.EventColor.GREEN;
                    } else if (lesson.hasHomework) {
                        eventOptions.color = CalendarApp.EventColor.ORANGE;
                    }

                    calendar.createEvent(eventTitle, lesson.startTime, lesson.endTime, eventOptions);
                    console.log(`Added: ${eventTitle} at ${lesson.startTime.toLocaleTimeString()}`);
                    addedCount++;
                } else {
                    console.log(`Skipped (exists): ${eventTitle}`);
                    skippedCount++;
                }

            } catch (error) {
                console.error(`Error processing lesson: ${error.toString()}`);
                skippedCount++;
            }
        });

        const result = {
            success: true,
            calendar: calendar.getName(),
            calendarId: calendar.getId(),
            added: addedCount,
            updated: updatedCount,
            deleted: deletedCount,
            skipped: skippedCount,
            totalProcessed: addedCount + updatedCount + deletedCount + skippedCount
        };

        console.log(`Timetable sync complete:`);
        console.log(`   Calendar: ${result.calendar}`);
        console.log(`   Added: ${result.added}`);
        console.log(`   Updated: ${result.updated}`);
        console.log(`   Deleted: ${result.deleted}`);
        console.log(`   Skipped: ${result.skipped}`);

        return result;

    } catch (error) {
        console.error('Error syncing timetable to calendar:', error.toString());
        return {
            success: false,
            error: error.toString(),
            added: 0,
            updated: 0,
            deleted: 0,
            skipped: 0
        };
    }
}

/**
 * Node.js version of syncTimetableToCalendar using Google Calendar API
 * Requires: npm install googleapis
 * 
 * @param {Array} lessons - Processed lesson objects from WebUntis
 * @param {Object} auth - Google OAuth2 client
 * @param {string|null} calendarId - Calendar ID or null for primary
 * @param {Object} options - Additional options for calendar integration
 * @returns {Promise<Object>} Sync result object
 */
async function syncTimetableToCalendarNodejs(lessons, auth, calendarId = 'primary', options = {}) {
    const opts = {
        updateExisting: true,
        includeNotes: true,
        ...options
    };

    try {
        if (!lessons || !Array.isArray(lessons) || lessons.length === 0) {
            return { 
                success: true, 
                message: 'No lessons found',
                added: 0,
                updated: 0,
                deleted: 0,
                skipped: 0
            };
        }

        const { WebUntisAPI } = require('./WebUntis.js');
        const { google } = require('googleapis');
        const calendar = google.calendar({ version: 'v3', auth });

        let addedCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;
        let deletedCount = 0;

        for (const lesson of lessons) {
            try {
                // Create event data
                const eventData = {
                    summary: lesson.isExam ? `📝 ${lesson.subject} (EXAM)` : 
                            lesson.isAdditional ? `➕ ${lesson.subject} (ADDITIONAL)` : 
                            lesson.subject + (lesson.hasHomework ? ' 📚' : ''),
                    start: {
                        dateTime: lesson.startTime.toISOString(),
                        timeZone: 'Europe/Vienna'
                    },
                    end: {
                        dateTime: lesson.endTime.toISOString(),
                        timeZone: 'Europe/Vienna'
                    },
                    description: `Subject: ${lesson.subjectLong || lesson.subject}\nTeacher: ${lesson.teacher}\nRoom: ${lesson.room}\nType: ${lesson.type}\nStatus: ${lesson.status}` +
                                (lesson.lessonInfo && opts.includeNotes ? `\n\nLesson Info: ${lesson.lessonInfo}` : '') +
                                (lesson.notes && opts.includeNotes ? `\n\nNotes: ${lesson.notes}` : '') +
                                '\n\nCreated by WebUntis API'
                };

                // Check for existing events
                const timeMin = new Date(lesson.startTime.getTime() - 30 * 60 * 1000).toISOString();
                const timeMax = new Date(lesson.endTime.getTime() + 30 * 60 * 1000).toISOString();
                
                const existingEvents = await calendar.events.list({
                    calendarId: calendarId,
                    timeMin: timeMin,
                    timeMax: timeMax,
                    q: lesson.subject
                });

                const existingEvent = existingEvents.data.items?.find(event => 
                    event.summary?.includes(lesson.subject)
                );

                if (lesson.isCancelled) {
                    if (existingEvent) {
                        await calendar.events.delete({
                            calendarId: calendarId,
                            eventId: existingEvent.id
                        });
                        WebUntisAPI.logVerbose(`Deleted cancelled lesson: ${eventData.summary} on ${lesson.date}`);
                        deletedCount++;
                    } else {
                        WebUntisAPI.logVerbose(`Skipped cancelled lesson (no event): ${eventData.summary} on ${lesson.date}`);
                        skippedCount++;
                    }
                    continue;
                }

                if (existingEvent && opts.updateExisting) {
                    await calendar.events.update({
                        calendarId: calendarId,
                        eventId: existingEvent.id,
                        resource: eventData
                    });
                    WebUntisAPI.logVerbose(`Updated: ${eventData.summary} on ${lesson.date}`);
                    updatedCount++;
                } else if (!existingEvent) {
                    await calendar.events.insert({
                        calendarId: calendarId,
                        resource: eventData
                    });
                    WebUntisAPI.logVerbose(`Added: ${eventData.summary} on ${lesson.date}`);
                    addedCount++;
                } else {
                    WebUntisAPI.logVerbose(`Skipped (exists): ${eventData.summary} on ${lesson.date}`);
                    skippedCount++;
                }

            } catch (error) {
                console.error(`Error syncing lesson ${lesson.subject} on ${lesson.date}: ${error.toString()}`);
                skippedCount++;
            }
        }

        const result = {
            success: true,
            added: addedCount,
            updated: updatedCount,
            deleted: deletedCount,
            skipped: skippedCount,
            totalProcessed: addedCount + updatedCount + deletedCount + skippedCount
        };

        return result;

    } catch (error) {
        return {
            success: false,
            error: error.toString(),
            added: 0,
            updated: 0,
            deleted: 0,
            skipped: 0
        };
    }
}

// Export functions for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sendHomeworkEmailNodejs,
        createHomeworkEmail,
        getEmailRecipients,
        syncHomeworkToCalendarNodejs,
        listAvailableCalendarsNodejs,
        syncTimetableToCalendarNodejs
    };
}
