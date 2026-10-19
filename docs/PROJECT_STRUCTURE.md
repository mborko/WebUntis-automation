# Project Structure

The automation for one student's WebUntis account: homework email, Home Assistant and SMS notifications,
Google Calendar sync and writing Lehrstoff/Hausübung plus teacher names into a class Google Sheet.

The same source files run in **Node.js** (`StartNode.js`) and in **Google Apps Script** (`Code.gs`).
Apps Script puts all files into one global scope, so shared files must not depend on Node-only imports at top level.

## File Structure

```
WebUntis-automation/
├── WebUntis.js            # WebUntisAPI class: login, homework, timetable, Lehrstoff, texts, formatting
├── Google.js              # Email (Gmail / nodemailer) and Google Calendar sync
├── Sheets.js              # Client of the sheet web app (sends Lehrstoff and Hausübung)
├── Sms.js                 # Open homework as SMS via SMS Gateway for Android
├── HomeAssistant.js       # Home Assistant notification and sensor
├── SheetWebApp.js         # Container-bound Apps Script in the class spreadsheet (writes the cells)
├── StartNode.js           # Node.js CLI (actions, argument parsing)
├── Code.gs                # Apps Script entry points (runDaily, quickTest, ...) and non-secret config
├── config.template.js     # Documented Node.js configuration (copy to config.js)
├── config.js              # Real Node.js configuration with credentials (gitignored)
├── docs/                  # Documentation
├── example/               # Empty class spreadsheet template
└── package.json           # Node.js dependencies (googleapis, node-fetch, nodemailer)
```

## Files

### `WebUntis.js` (Node.js and Apps Script)
- `WebUntisAPI`: JSON-RPC login, homework (REST), timetable, Lehrstoff per lesson, teacher names (office hours)
- `getWebUntisApiInstance()` / `clearWebUntisApiInstance()`: reuse one logged-in session per run
- `testWebUntisAPI()`: login and print the homework of the next 5 days
- Texts for email, Home Assistant and SMS in German and English (`WebUntisAPI.getTexts()`)
- `WebUntisAPI.verbose` / `logVerbose()`: details only with `--verbose`

### `Google.js` (Node.js and Apps Script)
- Email: `createHomeworkEmail()` (shared), `sendHomeworkEmail()` (GmailApp), `sendHomeworkEmailNodejs()` (nodemailer)
- Calendar: `syncHomeworkToCalendar()` / `syncHomeworkToCalendarNodejs()` create one reminder per homework;
  `syncTimetableToCalendarWorkflow()` / `syncTimetableToCalendarNodejs()` sync the lessons
- Homework events are identified by a `WebUntis-ID` line (Apps Script) or the event ID `untis<id>` (Node.js),
  so a second run updates the event instead of creating a duplicate

### `Sheets.js` (Node.js and Apps Script)
- Sends the collected Lehrstoff and Hausübung entries to the sheet web app (`syncLessonsToSheet()`)
- Uses `UrlFetchApp` in Apps Script and `fetch` in Node.js; never touches the spreadsheet directly

### `Sms.js` (Node.js and Apps Script)
- `sendHomeworkSms()`: open homework of the next days as compact GSM-7 text, sent via the gateway app on your phone
- `sendSmsViaGateway()`: HTTP call to the SMS Gateway for Android API

### `HomeAssistant.js` (Node.js and Apps Script)
- `sendHomeworkToHomeAssistant()`: notification through a Home Assistant service
- `updateHomeworkSensor()`: updates a Home Assistant sensor entity with the current homework status

### `SheetWebApp.js` (separate Apps Script project bound to the spreadsheet)
- `doPost()`: checks the shared secret and writes the entries into the tab of each subject
- Only has access to that one spreadsheet (`@OnlyCurrentDoc`)
- Changes take effect only after a new deployment in the spreadsheet's Apps Script editor

### `StartNode.js` (Node.js only)
- CLI actions: `email`, `homework`, `ha`, `sms`, `timetable`, `lessons`, `teachers`, `sheet`, `all`
- `test` shows the configuration status and tests the login; `quick` prints the open homework
- Exit code 1 if an action fails

### `Code.gs` (Apps Script only)
- Non-secret configuration objects; secrets are read with `getScriptProperty()` (Project Settings → Script Properties)
- `runDaily()`: email, calendar sync, sheet sync and SMS, in this order
- Manual functions: `quickTest()`, `backfillSheet()`, `homeAssistantNotification()`

## Documentation

- [`GOOGLE_APPS_SCRIPT_DEPLOYMENT.md`](GOOGLE_APPS_SCRIPT_DEPLOYMENT.md): setting up the Apps Script projects, Script Properties and triggers
- [`../README.md`](../README.md): overview, Node.js setup, scheduled runs

## Conventions

- One result line per action in the log, no emoji in log output; details only via `logVerbose()`
- Node.js-only functions end in `Nodejs`; the Apps Script variant has the same name without the suffix
- New config options go into `config.template.js` and into the config block of `Code.gs`
