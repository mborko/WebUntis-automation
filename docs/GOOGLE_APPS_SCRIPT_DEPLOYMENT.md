# WebUntis Automation - Google Apps Script Deployment Guide

This guide explains how to deploy the WebUntis automation files to Google Apps Script for easy Google services integration.

## Overview

The root directory contains standalone JavaScript files that work in both Node.js and Google Apps Script environments:

- `WebUntis.js` - Core WebUntis API wrapper with timetable functionality
- `Google.js` - Google services integration (Gmail, Calendar) 
- `Sheets.js` - Sends Lehrstoff and Hausübung to the spreadsheet web app (optional)
- `SheetWebApp.js` - Web app bound to the class spreadsheet that writes the cells (optional, separate project)
- `Code.gs` - Complete automation starter with configuration
- `AppsScript-Test.js` - Test functions and examples
- `HomeAssistant.js` - Home Assistant integration (optional)

## Google Apps Script Deployment

### Step 1: Create a New Google Apps Script Project

1. Go to [Google Apps Script](https://script.google.com)
2. Click "New Project"
3. Give your project a name (e.g., "WebUntis Automation")

### Step 2: Add the Files

**IMPORTANT**: For Google Apps Script, you must copy the content of both files to make functions available to each other.

#### Required Setup Order:
1. **Create WebUntis.gs**: Copy the entire content from `WebUntis.js` into a new file named `WebUntis.gs`
2. **Create Google.gs**: Copy the entire content from `Google.js` into a new file named `Google.gs`  
3. **Create Sheets.gs**: Copy the entire content from `Sheets.js` into a new file named `Sheets.gs` (optional, for the spreadsheet sync - see Step 3b)
4. **Create Code.gs**: Copy content from `Code.gs` into a new file named `Code.gs` (main automation)
5. **Create Test.gs**: Copy content from `AppsScript-Test.js` and rename to `Test.gs` (optional, for testing)

#### Why Multiple Files Are Needed:
- `WebUntis.gs` contains the core API functions like `getWebUntisApiInstance()` and `WebUntisAPI` class
- `Google.gs` contains the email and calendar functions that depend on the WebUntis functions
- `Code.gs` contains the main automation workflows and configuration
- In Google Apps Script, all files in the same project share the same global scope

#### File Structure in Google Apps Script:
```
Your Google Apps Script Project/
├── WebUntis.gs          (Copy content from WebUntis.js)
├── Google.gs            (Copy content from Google.js)
├── Sheets.gs            (Copy content from Sheets.js - optional)
├── Code.gs              (Copy content from Code.gs - main automation)
└── Test.gs              (Copy content from AppsScript-Test.js - optional)
```

### Step 3: Configure Your Credentials

Update the configuration objects in `Code.gs`:

```javascript
const UNTIS_CONFIG = {
    school: 'your-school-name',           // Your school identifier
    username: 'your-username',           // Your WebUntis username  
    password: 'your-password',           // Your WebUntis password
    server: 'your-webuntis-server',      // Your server (change if different)
    resourceId: 'your-student-resource-id' // Your student resource ID (found in timetable URL)
};

const MAIL_NOTIFICATION_CONFIG = {
    enabled: true,
    email: 'your-email@gmail.com',
    homeworkDaysAhead: 3,
    titlePrefix: null,           // Optional prefix for email subject (e.g., "📚 School:", "Student Name:")
    emailConfig: null            // Not needed for Google Apps Script
};

const CALENDAR_CONFIG = {
    homework: {
        calendarId: null,        // null for default calendar
        syncDaysAhead: 14,       // Days ahead to sync homework
    },
    timetable: {
        calendarId: null,        // null for default calendar  
        syncDaysAhead: 7,        // Days ahead to sync timetable
    },
};
```
    password: 'your-password',           // Your WebUntis password
    server: 'your-server.webuntis.com',  // Your WebUntis server
    resourceId: 12345                    // Your student resource ID
};
```

### Step 3b: Spreadsheet Sync (Lehrstoff and Hausübung, optional)

The teaching content ("Lehrstoff") and homework ("Hausübung") of past lessons can be written into a class overview spreadsheet. This uses **two separate Apps Script projects**, so the automation never gets access to all your spreadsheets:

| | Main project (this one, standalone) | Sheet web app (bound to the spreadsheet) |
|---|---|---|
| Files | `WebUntis.gs`, `Google.gs`, `Sheets.gs`, `Code.gs` | `SheetWebApp.gs` only |
| Contains | WebUntis credentials, collects the data | Shared secret, writes the cells |
| Permissions | External requests (plus Gmail/Calendar) | **Only this one spreadsheet** (`@OnlyCurrentDoc`) |

Both the main project and Node.js send their data to the same web app URL.

**Expected spreadsheet layout:**
- One tab per subject, named like the WebUntis subject short name (`D`, `M`, `E`, ...). Subjects without a tab are skipped.
- Row 2 contains the headers; lesson columns start with a weekday name (`Montag`, `Freitag - Doppelstunde`, ...).
- Column D (`von`) contains the Monday of each week, one row per week.

Text is written with the Lehrstoff in the first line and `HÜ: <Hausübung>` in its own line below, with text wrapping on so the row grows to fit. Existing cell content is never removed: Lehrstoff and each Hausübung are only appended (on a new line) if the cell doesn't already contain them, so the sync can run repeatedly.

#### 1. Create the sheet web app (bound script)

1. Open the spreadsheet → **Extensions → Apps Script** (you need edit access)
2. Replace the content of `Code.gs` there with the content of `SheetWebApp.js` (or add it as `SheetWebApp.gs`)
3. Set `SHEET_WEB_APP_SECRET` to a long random value (e.g. `openssl rand -hex 32`)
4. **Deploy → New deployment** → gear icon → **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (Node.js and the main project send no Google login; requests without the correct secret are rejected)
5. Authorize when asked - the permission screen only lists access to *this* spreadsheet
6. Copy the **Web app URL** (ending in `/exec`)

**Never put WebUntis credentials into this bound script** - every editor of the spreadsheet can open it. The secret only allows writing to the sheet, which editors can do anyway.

After changing `SheetWebApp.gs`, update the deployment (Deploy → Manage deployments → pencil icon → Version: New version → Deploy). The URL stays the same.

#### 2. Configure the main project

Add `Sheets.gs` (content of `Sheets.js`) and set `SHEET_CONFIG` in `Code.gs`:

```javascript
const SHEET_CONFIG = {
    webAppUrl: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
    secret: 'same value as SHEET_WEB_APP_SECRET',
    syncDaysBack: 7,                               // Days back to sync
    schoolYearStart: '2026-09-07',                 // Used by backfillSheet()
};
```

Run `syncSheet()` to test. To fill the whole school year, run `backfillSheet()` once (it makes one request per lesson; if it hits the 6 minute limit, run it in parts by moving `schoolYearStart`).

**Tip:** Test with a copy of the spreadsheet first (File → Make a copy copies the bound script too) and deploy the web app from the copy.

#### 3. Node.js (optional)

Put the same URL and secret into `config.js` → `SHEET_CONFIG` and run `node StartNode.js sheet` (or `node StartNode.js sheet 30` for the last 30 days). No Google credentials are needed.

### Step 4: Test Your Setup

1. **Run a test function**:
   - Select `quickTest` from the function dropdown
   - Click the "Run" button (▶️)
   - Check the execution log for results

2. **Run complete automation**:
   - Select `runDaily` from the function dropdown
   - Click "Run" to test email + calendar sync
   - Check logs for success messages

### Step 5: Set Up Automated Triggers (Optional)

For daily automated homework reminders:

1. In Google Apps Script, go to "Triggers" (clock icon)
2. Click "Add Trigger"
3. Choose function: `runDaily`
4. Event source: Time-driven
5. Type: Day timer
6. Time: Choose your preferred time (e.g., 8:00 AM)

### Step 6: Grant Permissions

When you first run functions, Google will ask for permissions:

- **Gmail API**: For sending homework emails
- **Calendar API**: For timetable sync
- **Spreadsheet** (bound web app only): Access to the class spreadsheet
- **External requests**: For WebUntis API calls

Click "Allow" for each permission request.

### Step 6: Using Async Functions

**Important**: The main functions in `Google.js` like `sendHomeworkEmail()` are async functions. In Google Apps Script:

- Use `await` when calling these functions from other async functions
- For triggers and manual execution, Google Apps Script handles async functions automatically

Example usage:
```javascript
// In a trigger function
async function dailyHomeworkReminder() {
    const config = {
        school: 'your-school',
        username: 'your-username', 
        password: 'your-password',
        server: 'your-server.webuntis.com'
    };
    
    await sendHomeworkEmail(config, 'your-email@gmail.com', 3);
}
```

## Key Differences: Node.js vs Google Apps Script

### Authentication
- **Google Apps Script**: Automatic OAuth for Google services
- **Node.js**: Manual OAuth setup required

### Email Sending
```javascript
// Google Apps Script
GmailApp.sendEmail(emailAddress, subject, body, options);

// Node.js (requires nodemailer)
const nodemailer = require('nodemailer');
await transporter.sendMail(mailOptions);
```

### Calendar Integration
```javascript
// Google Apps Script
CalendarApp.createEvent(title, startTime, endTime, options);

// Node.js (requires googleapis)
const { google } = require('googleapis');
await calendar.events.insert({ calendarId, resource: eventData });
```

### Module Imports
```javascript
// Google Apps Script - No imports needed
function myFunction() { ... }

// Node.js - Requires imports
const { WebUntisAPI } = require('./WebUntis.js');
```

## Available Functions

### Main Automation Functions
- `runDaily()` - Complete daily automation (email + calendar sync)
- `sendNotifications()` - Send homework email notifications
- `syncHomework()` - Sync homework to calendar
- `syncTimetable()` - Sync timetable to calendar
- `syncSheet()` - Write Lehrstoff and Hausübung of the last days to the class spreadsheet
- `backfillSheet()` - Same as `syncSheet()` since the start of the school year

### Individual Functions
- `sendHomeworkEmail()` - Send homework reminders via email
- `syncHomeworkToCalendar()` - Add homework as calendar events (full workflow)
- `syncTimetableToCalendarWorkflow()` - Sync timetable to calendar (full workflow)
- `syncLessonsToSheet()` - Send Lehrstoff and Hausübung to the spreadsheet web app (full workflow)
- `doPost()` - Endpoint of the sheet web app (`SheetWebApp.gs`, bound project)

### Test Functions
- `quickTest()` - Basic API functionality test
- `homeAssistantNotification()` - Test Home Assistant integration
- `listAvailableCalendars()` - Show all available calendars

### Utility Functions
- `syncTimetableToCalendar()` - Low-level calendar sync (expects processed lessons)
- `getWebUntisApiInstance()` - Get authenticated API instance

## Configuration Examples

### Email Configuration (Node.js)
```javascript
const emailConfig = {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: 'your-email@gmail.com',
        pass: 'your-app-password'  // Use App Password for Gmail
    },
    from: 'your-email@gmail.com'
};
```

### Home Assistant Configuration
```javascript
const HA_CONFIG = {
    url: 'http://your-home-assistant.local:8123',
    token: 'your-long-lived-access-token',
    service: 'notify.your_notification_service'
};
```

### Calendar Options
```javascript
const calendarOptions = {
    createCalendarIfNotExists: true,
    calendarName: 'WebUntis Timetable',
    updateExisting: true,
    includeNotes: true
};
```

## Troubleshooting

### Common Issues

#### "api.getHomeworkList is not a function" Error
**Cause**: The `WebUntis.js` content is not available in your Google Apps Script project.

**Solution**: 
1. Ensure you have copied the entire content of `WebUntis.js` into a file named `WebUntis.gs` in your Google Apps Script project
2. Both `WebUntis.gs` and `Google.gs` must be in the same Google Apps Script project
3. Save both files and try running the function again

#### Authentication Errors
- Verify your WebUntis credentials
- Check school name (usually lowercase, no spaces)
- Confirm server URL is correct

#### Permission Errors  
- Re-run the authorization flow
- Check if APIs are enabled in Google Cloud Console
- Verify calendar/email permissions

#### Bearer Token Issues
- Bearer token 403 errors are normal for many schools
- The system automatically falls back to session-based auth
- No action needed if you see "using session-based auth"

#### Timetable Access
- Ensure you have the correct `resourceId` (student ID)
- Check that you have timetable access permissions
- Verify the date range is valid

### Finding Your Resource ID

Your student resource ID can be found in the WebUntis timetable URL:
```
https://server.webuntis.com/WebUntis/...?type=1&elementType=1&elementId=12345
                                                                        ^^^^^
                                                                    This is your resourceId
```

## Advanced Usage

### Custom Triggers
Set up multiple triggers for different functions:
- Daily homework reminders at 8:00 AM
- Weekly timetable sync on Sunday evenings  
- Homework calendar updates every 6 hours

### Multiple Recipients
Use the `sendHomeworkToMultipleEmails()` function for family notifications:
```javascript
const recipients = [
    'student@family.com',
    'parent1@family.com', 
    'parent2@family.com'
];
```

### Calendar Integration
Create separate calendars for different types of events:
- "WebUntis Homework" for homework reminders
- "WebUntis Timetable" for lessons
- "WebUntis Exams" for exam-specific events

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the test functions for examples
3. Verify your configuration matches the examples
4. Check Google Apps Script execution logs for detailed error messages

## Security Notes

- Never share your WebUntis credentials
- Use App Passwords for Gmail in Node.js
- Keep Home Assistant tokens secure
- Regularly review and update permissions