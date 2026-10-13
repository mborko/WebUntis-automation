/**
 * @OnlyCurrentDoc
 *
 * Spreadsheet Web App for WebUntis (container-bound Google Apps Script)
 *
 * Writes the teaching content ("Lehrstoff") and homework ("Hausübung") sent by the WebUntis
 * automation (Node.js or the standalone Apps Script project) into this spreadsheet.
 * The @OnlyCurrentDoc annotation limits the script's permission to this one spreadsheet.
 *
 * Instructions:
 * 1. Open the spreadsheet → Extensions → Apps Script and paste this file as SheetWebApp.gs
 * 2. Set SHEET_WEB_APP_SECRET (same value as SHEET_CONFIG.secret in Code.gs / config.js)
 * 3. Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone)
 * 4. Use the /exec URL as SHEET_CONFIG.webAppUrl
 *
 * Do NOT put WebUntis credentials here - every editor of the spreadsheet can read this script.
 *
 * Expected spreadsheet layout (one tab per subject):
 *   - Tab name = WebUntis subject short name (e.g. "D", "M", "E")
 *   - Row 2 = headers, the lesson columns start with a weekday name (e.g. "Montag", "Freitag - Doppelstunde")
 *   - Column D ("von") = Monday of the week of that row
 *
 * Existing cell content is kept; Lehrstoff and each Hausübung are only appended if not already contained.
 * The regular teacher (e.g. "Wohlgenannt Claudia (WOH)") is written to F1 of a tab if F1 is empty.
 * With "overwrite" in the request, the cells and F1 are replaced with the data from WebUntis instead.
 */

const SHEET_WEB_APP_SECRET = '<CHOOSE_A_LONG_RANDOM_SECRET>'; // Must match SHEET_CONFIG.secret

const SHEET_WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']; // School days, starting with Monday
const SHEET_HEADER_ROW = 2;          // Row with "KW | UW | von | Tag | Montag | ..."
const SHEET_WEEK_START_COLUMN = 4;   // Column D ("von") holds the Monday of each week
const SHEET_MIN_ROW_HEIGHT = 37;     // Minimum height (pixels) of rows with inserted text
const SHEET_TEACHER_CELL = 'F1';     // Cell for the teacher name, only filled if empty

/**
 * Web app endpoint
 * @param {Object} e - POST event with JSON body { secret, entries, teachers, overwrite }
 * @returns {TextOutput} JSON result
 */
function doPost(e) {
    const respond = (data) => ContentService
        .createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);

    try {
        const request = JSON.parse(e.postData.contents);

        if (SHEET_WEB_APP_SECRET.startsWith('<') || request.secret !== SHEET_WEB_APP_SECRET) {
            return respond({ success: false, error: 'Invalid secret' });
        }
        if (!Array.isArray(request.entries)) {
            return respond({ success: false, error: 'Missing entries' });
        }

        const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        const overwrite = request.overwrite === true;
        const result = applyLessonEntriesToSpreadsheet(spreadsheet, request.entries, overwrite);
        const teachersWritten = applyTeachersToSpreadsheet(spreadsheet, request.teachers || {}, overwrite);
        result.overwrite = overwrite; // Lets the client detect deployments that do not support overwriting
        result.teachersWritten = teachersWritten.length;
        result.details.teachers = teachersWritten;
        return respond(result);
    } catch (error) {
        return respond({ success: false, error: error.toString() });
    }
}

/**
 * Get the Monday (YYYY-MM-DD) and the German weekday name for a date string
 * Calculated in UTC on purpose to avoid timezone shifts
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {{monday: string, weekday: string|null}} weekday is null on Saturday and Sunday
 */
function getSheetWeekPosition(date) {
    const day = new Date(`${date}T00:00:00Z`);
    const daysSinceMonday = (day.getUTCDay() + 6) % 7;
    const monday = new Date(day.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
    return {
        monday: monday.toISOString().substring(0, 10),
        weekday: SHEET_WEEKDAYS[daysSinceMonday] || null
    };
}

/**
 * Normalize cell text for "already contained" checks, ignoring case, whitespace and punctuation
 * @param {string} text - Cell text
 * @returns {string} Lower case letters and digits separated by single spaces
 */
function normalizeSheetText(text) {
    return String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Build the text that is still missing in a cell (same format as WebUntisAPI.formatLessonSheetText)
 * @param {string} existing - Current cell text
 * @param {Object} entry - Entry with contents and homeworks arrays
 * @returns {string} Missing text or empty string if everything is already contained
 */
function getMissingSheetText(existing, entry) {
    const cell = normalizeSheetText(existing);
    const isMissing = (part) => !cell.includes(normalizeSheetText(part));
    const contents = (entry.contents || []).filter(isMissing);
    const homeworks = (entry.homeworks || []).filter(isMissing);

    return [contents.join(' / '), homeworks.length > 0 ? `HÜ: ${homeworks.join('; ')}` : '']
        .filter(Boolean)
        .join('\n');
}

/**
 * Write the teacher name of each subject into its tab, only where the teacher cell is empty
 * @param {Spreadsheet} spreadsheet - This spreadsheet
 * @param {Object} teachers - Subject short name -> "Surname Firstname (SHORT)"
 * @param {boolean} overwrite - Replace a different existing name (default: false)
 * @returns {Array} Written teacher names: { subject, teacher }
 */
function applyTeachersToSpreadsheet(spreadsheet, teachers, overwrite = false) {
    const written = [];

    Object.entries(teachers).forEach(([subject, teacher]) => {
        const sheet = spreadsheet.getSheetByName(subject);
        if (!sheet || !teacher) return;

        const cell = sheet.getRange(SHEET_TEACHER_CELL);
        const existing = String(cell.getValue()).trim();
        if (existing === '' || (overwrite && existing !== teacher)) {
            cell.setValue(teacher);
            console.log(`${subject}: ${teacher}`);
            written.push({ subject, teacher });
        }
    });

    return written;
}

/**
 * Fit the written rows to their content, but keep at least SHEET_MIN_ROW_HEIGHT pixels
 * @param {Map} writtenRows - Sheet -> Set of written row numbers
 */
function resizeWrittenRows(writtenRows) {
    if (writtenRows.size === 0) return;

    writtenRows.forEach((rows, sheet) => rows.forEach(row => sheet.autoResizeRows(row, 1)));
    SpreadsheetApp.flush(); // Apply the auto resize before reading the new heights

    writtenRows.forEach((rows, sheet) => rows.forEach(row => {
        if (sheet.getRowHeight(row) < SHEET_MIN_ROW_HEIGHT) {
            sheet.setRowHeight(row, SHEET_MIN_ROW_HEIGHT);
        }
    }));
}

/**
 * Write lesson entries into the spreadsheet (append if missing)
 * @param {Spreadsheet} spreadsheet - This spreadsheet
 * @param {Array} entries - Entries from api.getLessonSheetEntries(): { subject, date, contents, homeworks, text }
 * @param {boolean} overwrite - Replace the cell with the entry text instead of appending what is missing (default: false)
 * @returns {Object} Result with written, unchanged, skipped and unmatched counts
 */
function applyLessonEntriesToSpreadsheet(spreadsheet, entries, overwrite = false) {
    const result = { success: true, written: 0, unchanged: 0, skipped: 0, unmatched: 0 };
    // Per-cell details for verbose logging in Node.js (node StartNode.js --verbose)
    result.details = { written: [], unchanged: [], skipped: [], unmatched: [] };
    const timeZone = spreadsheet.getSpreadsheetTimeZone();
    const tabs = new Map();
    const writtenRows = new Map();   // sheet -> Set of written row numbers
    const missingTabs = new Set();

    entries.forEach(entry => {
        // Read every tab only once per request
        if (!tabs.has(entry.subject)) {
            const sheet = spreadsheet.getSheetByName(entry.subject);
            tabs.set(entry.subject, sheet ? { sheet, values: sheet.getDataRange().getValues() } : null);
        }
        const tab = tabs.get(entry.subject);

        if (!tab) {
            missingTabs.add(entry.subject);
            result.details.skipped.push({ subject: entry.subject, date: entry.date });
            result.skipped++;
            return;
        }

        const { monday, weekday } = getSheetWeekPosition(entry.date);
        if (!weekday) {
            console.log(`No school day: ${entry.subject} on ${entry.date}`);
            result.details.unmatched.push({ subject: entry.subject, date: entry.date });
            result.unmatched++;
            return;
        }

        const rowIndex = tab.values.findIndex((row, index) => {
            const weekStart = row[SHEET_WEEK_START_COLUMN - 1];
            return index >= SHEET_HEADER_ROW &&
                Object.prototype.toString.call(weekStart) === '[object Date]' &&
                Utilities.formatDate(weekStart, timeZone, 'yyyy-MM-dd') === monday;
        });
        const columnIndex = tab.values[SHEET_HEADER_ROW - 1]
            .findIndex(header => String(header).trim().startsWith(weekday));

        if (rowIndex === -1 || columnIndex === -1) {
            console.log(`No cell for ${entry.subject} on ${weekday} ${entry.date} (week ${monday})`);
            result.details.unmatched.push({ subject: entry.subject, date: entry.date });
            result.unmatched++;
            return;
        }

        const existing = String(tab.values[rowIndex][columnIndex] || '');
        const missingText = overwrite
            ? (existing.trim() === entry.text.trim() ? '' : entry.text)
            : getMissingSheetText(existing, entry);
        if (!missingText) {
            result.details.unchanged.push({ subject: entry.subject, date: entry.date });
            result.unchanged++;
            return;
        }

        const newValue = overwrite || !existing.trim() ? missingText : `${existing}\n${missingText}`;
        // Wrap the text so the row can grow to show the whole content
        tab.sheet.getRange(rowIndex + 1, columnIndex + 1).setValue(newValue).setWrap(true);
        if (!writtenRows.has(tab.sheet)) writtenRows.set(tab.sheet, new Set());
        writtenRows.get(tab.sheet).add(rowIndex + 1);
        tab.values[rowIndex][columnIndex] = newValue;
        console.log(`${entry.subject} ${weekday} ${entry.date}: ${missingText}`);
        result.details.written.push({ subject: entry.subject, date: entry.date, text: missingText });
        result.written++;
    });

    resizeWrittenRows(writtenRows);

    if (missingTabs.size > 0) {
        result.skippedSubjects = Array.from(missingTabs);
        console.log(`Subjects without a tab (skipped): ${result.skippedSubjects.join(', ')}`);
    }

    return result;
}
