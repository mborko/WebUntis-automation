/**
 * WebUntis API Wrapper
 * A simplified wrapper for the WebUntis API focused on homework retrieval
 */

class WebUntisAPI {
    constructor(config) {
        this.school = config.school;
        this.username = config.username;
        this.password = config.password;
        this.server = config.server || '<YOUR_WEBUNTIS_SERVER>';
        this.baseUrl = `https://${this.server}/WebUntis/jsonrpc.do`;
        this.apiBaseUrl = `https://${this.server}/WebUntis/api`;
        this.sessionId = null;
        this.personId = null;
        this.personType = null;
        this.bearerToken = null;
        
        // Store the full config for later use (like resourceId)
        this.config = config;
    }

    /**
     * Format a date for API use (YYYY-MM-DD format)
     * @param {Date} date - Date to format
     * @returns {string} Formatted date string
     */
    static formatDateForAPI(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Authenticate with WebUntis API
     * @returns {Promise<boolean>} Success status
     */
    async authenticate() {
        try {
            const response = await this.makeRequest('authenticate', {
                user: this.username,
                password: this.password,
                client: 'WebUntisAPI'
            });

            if (response.result) {
                this.sessionId = response.result.sessionId;
                this.personId = response.result.personId;
                this.personType = response.result.personType;

                // Try to get bearer token, but don't fail if it doesn't work
                await this.getBearerToken();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Authentication failed:', error);
            return false;
        }
    }

    /**
     * Make a fetch request that works in both Google Apps Script and Node.js environments
     * @param {string} url - Request URL
     * @param {Object} options - Fetch options
     * @returns {Promise<Response>} Response object
     */
    async makeFetch(url, options = {}) {
        // Google Apps Script environment
        if (typeof UrlFetchApp !== 'undefined') {
            const gasOptions = {
                method: options.method || 'GET',
                headers: options.headers || {},
                muteHttpExceptions: true
            };
            
            if (options.body) {
                gasOptions.payload = options.body;
            }
            
            const response = UrlFetchApp.fetch(url, gasOptions);
            
            // Create a response-like object
            return {
                ok: response.getResponseCode() >= 200 && response.getResponseCode() < 300,
                status: response.getResponseCode(),
                text: () => Promise.resolve(response.getContentText()),
                json: () => Promise.resolve(JSON.parse(response.getContentText()))
            };
        }
        // Node.js/Browser environment
        else if (typeof fetch !== 'undefined') {
            return await fetch(url, options);
        }
        // Fallback error
        else {
            throw new Error('No fetch implementation available. This environment is not supported.');
        }
    }

    /**
     * Get Bearer Token for REST API access
     * @returns {Promise<boolean>} Success status
     */
    async getBearerToken() {
        try {
            const tokenUrl = `${this.apiBaseUrl}/token/new?school=${this.school}`;
            
            const response = await this.makeFetch(tokenUrl, {
                method: 'GET',
                headers: {
                    'Cookie': `JSESSIONID=${this.sessionId}`
                }
            });

            // Without a token (e.g. 403 for some schools) the session-based auth is used
            if (response.ok) {
                const tokenValue = (await response.text()).trim();
                if (tokenValue) {
                    this.bearerToken = tokenValue;
                    return true;
                }
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Logout from WebUntis API
     * @returns {Promise<boolean>} Success status
     */
    async logout() {
        try {
            if (!this.sessionId) return true;
            
            await this.makeRequest('logout', {});
            this.sessionId = null;
            this.personId = null;
            this.personType = null;
            this.bearerToken = null;
            return true;
        } catch (error) {
            console.error('Logout failed:', error);
            return false;
        }
    }

    /**
     * Get homework via REST API
     * @param {string} startDate - Start date in YYYYMMDD format
     * @param {string} endDate - End date in YYYYMMDD format
     * @returns {Promise<Object>} Homework data with records, homeworks, teachers, and lessons
     */
    async getHomework(startDate, endDate) {
        if (!this.sessionId) {
            throw new Error('Not authenticated. Call authenticate() first.');
        }

        const url = `${this.apiBaseUrl}/homeworks/lessons?startDate=${startDate}&endDate=${endDate}`;
        
        const headers = {
            'Cookie': `JSESSIONID=${this.sessionId}`,
            'User-Agent': 'WebUntisAPI/1.0'
        };

        // Add bearer token if available
        if (this.bearerToken) {
            headers['Authorization'] = `Bearer ${this.bearerToken}`;
        }

        const response = await this.makeFetch(url, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.data || data;
    }

    /**
     * Get homework for today
     * @returns {Promise<Object>} Today's homework
     */
    async getTodaysEvents() {
        const today = WebUntisAPI.formatDate(new Date());
        return await this.getHomework(today, today);
    }

    /**
     * Get homework for this week
     * @returns {Promise<Object>} This week's homework
     */
    async getWeekEvents() {
        const now = new Date();
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6));
        
        const startDate = WebUntisAPI.formatDate(startOfWeek);
        const endDate = WebUntisAPI.formatDate(endOfWeek);
        
        return await this.getHomework(startDate, endDate);
    }

    /**
     * Get homework for the next N days
     * @param {number} days - Number of days to look ahead (default: 7)
     * @param {boolean} onlyIncomplete - Only show incomplete homework (default: true)
     * @returns {Promise<Array|null>} Array of homework objects or null if no homework found
     */
    async getHomeworkList(days = 7, onlyIncomplete = true) {
        const now = new Date();
        
        // Always start from today
        const startDate = now;
        const future = new Date(startDate.getTime() + (days * 24 * 60 * 60 * 1000));
        
        const startDateStr = WebUntisAPI.formatDate(startDate);
        const endDateStr = WebUntisAPI.formatDate(future);
        
        const homeworkData = await this.getHomework(startDateStr, endDateStr);
        const homework = homeworkData.homeworks || [];
        const lessons = homeworkData.lessons || [];
        
        // Create lesson lookup map for subjects
        const lessonMap = new Map(lessons.map(l => [l.id, l.subject]));
        
        // Filter homework
        let filteredHomework = homework;
        if (onlyIncomplete) {
            filteredHomework = homework.filter(hw => !hw.completed);
        }
        
        // Sort by due date
        filteredHomework.sort((a, b) => {
            const dateA = parseInt(a.dueDate);
            const dateB = parseInt(b.dueDate);
            return dateA - dateB;
        });
        
        // Return null if no homework found
        if (filteredHomework.length === 0) {
            return null;
        }
        
        // Add subject information to homework objects
        return filteredHomework.map(hw => ({
            ...hw,
            subjectName: lessonMap.get(hw.lessonId) || hw.subject || 'Unknown Subject'
        }));
    }

    /**
     * Format homework list to readable string
     * @param {Array|null} homeworkList - Array of homework objects or null
     * @param {number} days - Number of days for display purposes
     * @param {boolean} onlyIncomplete - Whether only incomplete homework was requested
     * @returns {string} Formatted string with Subject, Due, Text
     */
    formatHomework(homeworkList, days = 7, onlyIncomplete = true) {
        if (!homeworkList || homeworkList.length === 0) {
            return `No ${onlyIncomplete ? 'open ' : ''}homework found for the next ${days} days.`;
        }
        
        // Format the homework
        let formattedString = `📚 HOMEWORK FOR NEXT ${days} DAYS (${homeworkList.length} ${onlyIncomplete ? 'open ' : ''}assignments)\n`;
        formattedString += "=".repeat(60) + "\n\n";
        
        homeworkList.forEach((hw, index) => {
            const dueDate = this.formatWebUntisDate(hw.dueDate);
            const subject = hw.subjectName || 'Unknown Subject';
            const text = hw.text || 'No description';
            const status = hw.completed ? '✅' : '📋';
            
            formattedString += `${index + 1}. ${status} ${subject}\n`;
            formattedString += `   📅 Due: ${dueDate}\n`;
            formattedString += `   📝 ${text}\n`;
            formattedString += "-".repeat(40) + "\n";
        });
        
        return formattedString;
    }

    /**
     * Get formatted homework for the next N days (legacy method for backward compatibility)
     * @param {number} days - Number of days to look ahead (default: 7)
     * @param {boolean} onlyIncomplete - Only show incomplete homework (default: true)
     * @returns {Promise<string>} Formatted string with Subject, Due, Text
     */
    async getFormattedHomework(days = 7, onlyIncomplete = true) {
        const homeworkList = await this.getHomeworkList(days, onlyIncomplete);
        return this.formatHomework(homeworkList, days, onlyIncomplete);
    }

    /**
     * Get timetable data from WebUntis REST API
     * @param {Date|string} startDate - Start date as Date object or YYYY-MM-DD string
     * @param {Date|string} endDate - End date as Date object or YYYY-MM-DD string
     * @param {number} resourceId - Student/teacher resource ID (optional, uses config.resourceId if not provided)
     * @returns {Promise<Object|null>} Timetable data with days and entries, or null if no data found
     */
    async getTimetableData(startDate, endDate, resourceId = null) {
        if (!this.sessionId) {
            throw new Error('Not authenticated. Call authenticate() first.');
        }

        // Convert Date objects to strings if needed
        const startDateStr = startDate instanceof Date ? WebUntisAPI.formatDateForAPI(startDate) : startDate;
        const endDateStr = endDate instanceof Date ? WebUntisAPI.formatDateForAPI(endDate) : endDate;
        
        // Use provided resourceId or get from config
        const studentId = resourceId || this.config?.resourceId;
        
        if (!studentId || studentId === '<YOUR_STUDENT_RESOURCE_ID>') {
            throw new Error(`Student Resource ID is required for timetable access!`);
        }

        // Get timetable data for the specified period
        const timetableData = await this.getTimetableDataForPeriod(startDateStr, endDateStr, studentId);

        if (!timetableData || !timetableData.days || timetableData.days.length === 0) {
            return null;
        }
        return timetableData;
    }

    /**
     * Get timetable data for a single period (internal method)
     * @param {string} startDate - Start date in YYYY-MM-DD format
     * @param {string} endDate - End date in YYYY-MM-DD format
     * @param {number} studentId - Student resource ID
     * @returns {Promise<Object|null>} Timetable data for the period
     */
    async getTimetableDataForPeriod(startDate, endDate, studentId) {
        const headers = {
            'Cookie': `JSESSIONID=${this.sessionId}`,
            'User-Agent': 'WebUntisAPI/1.0'
        };

        // Add bearer token if available
        if (this.bearerToken) {
            headers['Authorization'] = `Bearer ${this.bearerToken}`;
        }

        // Direct call to timetable entries endpoint
        const entriesUrl = `https://${this.server}/WebUntis/api/rest/view/v1/timetable/entries?start=${startDate}&end=${endDate}&format=2&resourceType=STUDENT&resources=${studentId}&periodTypes=&timetableType=MY_TIMETABLE`;

        const response = await this.makeFetch(entriesUrl, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) {
            const responseText = await response.text();
            throw new Error(`Timetable HTTP error! status: ${response.status}: ${responseText.substring(0, 200)}`);
        }

        return await response.json();
    }

    /**
     * Process timetable data and extract lessons
     * @param {Object|null} timetableData - Raw timetable data from getTimetableData
     * @param {Object} options - Processing options
     * @param {boolean} options.skipCancelled - Skip cancelled lessons (default: false)
     * @param {boolean} options.includeNotes - Include lesson notes (default: true)
     * @returns {Array|null} Array of processed lesson objects or null if no lessons
     */
    processTimetableData(timetableData, options = {}) {
        if (!timetableData || !timetableData.days) {
            return null;
        }

        const opts = {
            skipCancelled: false,
            includeNotes: true,
            ...options
        };

        const lessons = [];

        timetableData.days.forEach(day => {
            if (!day.gridEntries || !Array.isArray(day.gridEntries)) {
                return;
            }

            day.gridEntries.forEach(entry => {
                // Skip cancelled lessons if option is set
                if (opts.skipCancelled && entry.status === 'CANCELLED') {
                    return;
                }

                // Positions differ between schools, so look elements up by type
                const subjectElement = WebUntisAPI.findTimetableElement(entry, 'SUBJECT', 'position2');
                const teacherElement = WebUntisAPI.findTimetableElement(entry, 'TEACHER', 'position1');
                const roomElement = WebUntisAPI.findTimetableElement(entry, 'ROOM', 'position3');

                try {
                    lessons.push({
                        id: entry.ids?.[0] || null,
                        date: day.date,
                        startTime: new Date(entry.duration.start),
                        endTime: new Date(entry.duration.end),
                        type: entry.type,
                        status: entry.status,
                        teacher: teacherElement?.displayName || 'Unknown Teacher',
                        teacherLong: teacherElement?.longName || '',
                        subject: subjectElement?.displayName || 'Unknown Subject',
                        subjectLong: subjectElement?.longName || '',
                        room: roomElement?.displayName || 'Unknown Room',
                        roomLong: roomElement?.longName || '',
                        icons: entry.icons || [],
                        hasHomework: (entry.icons || []).includes('HOMEWORK'),
                        isExam: entry.type === 'EXAM',
                        isCancelled: entry.status === 'CANCELLED',
                        isAdditional: entry.status === 'ADDITIONAL',
                        notes: opts.includeNotes ? entry.notesAll || '' : '',
                        lessonInfo: opts.includeNotes ? entry.lessonInfo || '' : '',
                        texts: opts.includeNotes ? entry.texts || [] : [],
                        rawEntry: entry // Keep reference to original data
                    });
                } catch (error) {
                    console.error(`Error processing lesson entry on ${day.date}: ${error.toString()}`);
                }
            });
        });

        return lessons.length > 0 ? lessons : null;
    }

    /**
     * Get the processed lessons (including cancelled ones) of the last N days up to today
     * Fetch them once and pass them to getLessonSheetEntries() and getSubjectTeachers()
     * to avoid loading the timetable twice
     * @param {number} daysBack - Number of days to look back including today
     * @returns {Promise<Array>} Processed lesson objects (empty if none)
     */
    async getPastLessons(daysBack) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - daysBack);

        const timetableData = await this.getTimetableData(startDate, endDate);
        return this.processTimetableData(timetableData) || [];
    }

    /**
     * Find a timetable element (subject, teacher, room) of an entry by its type
     * @param {Object} entry - Raw timetable grid entry
     * @param {string} type - Element type: 'SUBJECT', 'TEACHER' or 'ROOM'
     * @param {string} fallbackPosition - Position to use if no element has a type
     * @returns {Object|null} The element's current data (displayName, longName, ...)
     */
    static findTimetableElement(entry, type, fallbackPosition) {
        for (let i = 1; i <= 7; i++) {
            const element = (entry[`position${i}`] || []).find(p => p.current?.type === type);
            if (element) return element.current;
        }
        return entry[fallbackPosition]?.[0]?.current || null;
    }

    /**
     * Get the teaching content ("Lehrstoff") of a lesson from the class register
     * @param {Object} lesson - Processed lesson object from processTimetableData
     * @returns {Promise<string>} Teaching content or empty string if none was entered
     */
    async getTeachingContent(lesson) {
        const headers = {
            'Cookie': `JSESSIONID=${this.sessionId}`,
            'User-Agent': 'WebUntisAPI/1.0'
        };

        if (this.bearerToken) {
            headers['Authorization'] = `Bearer ${this.bearerToken}`;
        }

        // The endpoint expects local date-times without timezone suffix
        const toLocalIso = (date) => `${WebUntisAPI.formatDateForAPI(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00`;
        const url = `${this.apiBaseUrl}/rest/view/v2/calendar-entry/detail?elementId=${this.config.resourceId}&elementType=5` +
            `&startDateTime=${toLocalIso(lesson.startTime)}&endDateTime=${toLocalIso(lesson.endTime)}&homeworkOption=DUE`;

        const response = await this.makeFetch(url, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) {
            console.log(`Could not get lesson details for ${lesson.subject} on ${lesson.date} (status ${response.status})`);
            return '';
        }

        const data = await response.json();
        return (data.calendarEntries?.[0]?.teachingContent || '').trim();
    }

    /**
     * Get the regular teacher of each subject with full name, e.g. { D: 'Wohlgenannt Claudia (WOH)' }
     * The regular teacher is taken from the timetable (substitutes are ignored),
     * the full name from the office hours ("Sprechstunden") list
     * @param {Array|null} lessons - Lessons from getPastLessons(), fetched for the last daysBack days if omitted
     * @param {number} daysBack - Number of days of timetable to look at if no lessons are given (default: 28)
     * @returns {Promise<Object>} Subject short name -> "Surname Firstname (SHORT)"
     */
    async getSubjectTeachers(lessons = null, daysBack = 28) {
        const endDate = new Date();
        if (!lessons) {
            lessons = await this.getPastLessons(daysBack);
        }

        // 1. Count the regular teacher of each subject; for substituted lessons the regular teacher is "removed"
        const counts = {};
        lessons.forEach(lesson => {
            for (let i = 1; i <= 7; i++) {
                (lesson.rawEntry[`position${i}`] || []).forEach(element => {
                    const regular = element.current?.type === 'TEACHER' && element.current.status === 'REGULAR'
                        ? element.current
                        : (element.removed?.type === 'TEACHER' ? element.removed : null);
                    if (regular?.shortName) {
                        counts[lesson.subject] = counts[lesson.subject] || {};
                        counts[lesson.subject][regular.shortName] = (counts[lesson.subject][regular.shortName] || 0) + 1;
                    }
                });
            }
        });

        // 2. Full names from the office hours list, e.g. "Wohlgenannt Claudia (WOH)"
        const fullNames = new Map();
        try {
            const headers = {
                'Cookie': `JSESSIONID=${this.sessionId}`,
                'User-Agent': 'WebUntisAPI/1.0'
            };
            if (this.bearerToken) {
                headers['Authorization'] = `Bearer ${this.bearerToken}`;
            }

            const response = await this.makeFetch(`${this.apiBaseUrl}/public/officehours/hours?date=${WebUntisAPI.formatDate(endDate)}`, {
                method: 'GET',
                headers: headers
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            (data.data || []).forEach(officeHour => {
                const match = /\(([^)]+)\)\s*$/.exec(officeHour.teacher || '');
                if (match) fullNames.set(match[1], officeHour.teacher.trim());
            });
        } catch (error) {
            console.log(`Could not get office hours for teacher names: ${error.toString()}`);
        }

        // 3. Most frequent regular teacher per subject, only if the full name is known
        const teachers = {};
        Object.entries(counts).forEach(([subject, teacherCounts]) => {
            const shortName = Object.keys(teacherCounts).sort((a, b) => teacherCounts[b] - teacherCounts[a])[0];
            if (fullNames.has(shortName)) {
                teachers[subject] = fullNames.get(shortName);
            } else {
                console.log(`No full name found for teacher ${shortName} (${subject})`);
            }
        });
        return teachers;
    }

    /**
     * Collect teaching content ("Lehrstoff") and homework ("Hausübung") per subject and day
     * for the last N days, e.g. to fill a class overview spreadsheet
     * @param {number} daysBack - Number of days to look back including today (default: 7)
     * @param {Array|null} lessons - Lessons from getPastLessons() covering at least daysBack days, fetched if omitted
     * @returns {Promise<Array>} Entries like { subject, date: 'YYYY-MM-DD', contents: [], homeworks: [], text: '<Lehrstoff>\nHÜ: <Hausübung>' }
     */
    async getLessonSheetEntries(daysBack = 7, lessons = null) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - daysBack);
        if (!lessons) {
            lessons = await this.getPastLessons(daysBack);
        }

        const groups = new Map();
        const getGroup = (subject, date) => {
            const key = `${subject}|${date}`;
            if (!groups.has(key)) {
                groups.set(key, { subject, date, contents: [], homeworks: [] });
            }
            return groups.get(key);
        };
        const addUnique = (list, text) => {
            const trimmed = (text || '').trim();
            if (trimmed && !list.includes(trimmed)) list.push(trimmed);
        };

        // 1. Lehrstoff from the class register, one request per lesson (the given lessons may cover more days)
        const firstDate = WebUntisAPI.formatDateForAPI(startDate);
        const lessonsInRange = lessons.filter(lesson => !lesson.isCancelled && lesson.date.substring(0, 10) >= firstDate);
        for (const lesson of lessonsInRange) {
            const content = await this.getTeachingContent(lesson);
            addUnique(getGroup(lesson.subject, lesson.date.substring(0, 10)).contents, content);
        }

        // 2. Hausübung, assigned to the lesson day it was given on
        const homeworkData = await this.getHomework(WebUntisAPI.formatDate(startDate), WebUntisAPI.formatDate(endDate));
        const lessonSubjects = new Map((homeworkData.lessons || []).map(l => [l.id, l.subject]));
        const firstDay = parseInt(WebUntisAPI.formatDate(startDate));
        const lastDay = parseInt(WebUntisAPI.formatDate(endDate));
        (homeworkData.homeworks || [])
            .filter(hw => hw.date >= firstDay && hw.date <= lastDay && lessonSubjects.has(hw.lessonId))
            .forEach(hw => {
                const dateStr = hw.date.toString();
                const date = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
                addUnique(getGroup(lessonSubjects.get(hw.lessonId), date).homeworks, hw.text);
            });

        // 3. Keep the parts separately so a sheet can check which of them it already contains
        return Array.from(groups.values())
            .filter(g => g.contents.length > 0 || g.homeworks.length > 0)
            .map(g => ({
                ...g,
                text: WebUntisAPI.formatLessonSheetText(g.contents, g.homeworks)
            }))
            .sort((a, b) => a.date.localeCompare(b.date) || a.subject.localeCompare(b.subject));
    }

    /**
     * Build the cell text of a lesson: Lehrstoff in the first line, "HÜ: <Hausübung>" in the next line
     * @param {Array<string>} contents - Teaching contents of the day
     * @param {Array<string>} homeworks - Homework texts of the day
     * @returns {string} Cell text
     */
    static formatLessonSheetText(contents, homeworks) {
        return [contents.join(' / '), homeworks.length > 0 ? `HÜ: ${homeworks.join('; ')}` : '']
            .filter(Boolean)
            .join('\n');
    }

    /**
     * Format WebUntis date (YYYYMMDD) to readable format
     * @param {number} date - Date in YYYYMMDD format
     * @returns {string} Formatted date string (DD.MM.YYYY)
     */
    formatWebUntisDate(date) {
        if (!date) return 'Unknown Date';
        
        const dateStr = date.toString();
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        
        return `${day}.${month}.${year}`;
    }

    /**
     * Make a request to the WebUntis JSON-RPC API
     * @param {string} method - API method name
     * @param {Object} params - Method parameters
     * @returns {Promise<Object>} API response
     */
    async makeRequest(method, params = {}) {
        const requestData = {
            id: Date.now().toString(),
            method: method,
            params: params,
            jsonrpc: '2.0'
        };

        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'WebUntisAPI/1.0'
        };

        if (this.sessionId) {
            headers['Cookie'] = `JSESSIONID=${this.sessionId}`;
        }

        const url = method === 'authenticate' 
            ? `${this.baseUrl}?school=${this.school}`
            : `${this.baseUrl};jsessionid=${this.sessionId}?school=${this.school}`;

        const response = await this.makeFetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(`WebUntis API error: ${data.error.message} (Code: ${data.error.code})`);
        }

        return data;
    }

    /**
     * Format date to WebUntis format (YYYYMMDD)
     * @param {Date} date - Date object
     * @returns {string} Formatted date string
     */
    static formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }
}

/**
 * Event Notification Manager
 * Manages notifications for WebUntis events
 */
class EventNotificationManager {
    constructor(webUntisAPI) {
        this.api = webUntisAPI;
        this.notificationCallbacks = [];
    }

    /**
     * Add a notification callback
     * @param {Function} callback - Function to call when events are found
     */
    addNotificationCallback(callback) {
        if (typeof callback === 'function') {
            this.notificationCallbacks.push(callback);
        }
    }

    /**
     * Check for upcoming events and trigger notifications
     * @param {number} hoursAhead - How many hours ahead to check
     */
    async checkUpcomingEvents(hoursAhead = 24) {
        try {
            const now = new Date();
            const future = new Date(now.getTime() + (hoursAhead * 60 * 60 * 1000));
            
            const startDate = WebUntisAPI.formatDate(now);
            const endDate = WebUntisAPI.formatDate(future);
            
            const homeworkData = await this.api.getHomework(startDate, endDate);
            const upcomingEvents = this.filterUpcomingHomework(homeworkData.homeworks || [], hoursAhead);
            
            if (upcomingEvents.length > 0) {
                this.triggerNotifications(upcomingEvents);
            }
            
            return upcomingEvents;
        } catch (error) {
            console.error('Failed to check upcoming events:', error);
            return [];
        }
    }

    /**
     * Filter homework that is due within the specified timeframe
     * @param {Array} homework - Array of homework
     * @param {number} hoursAhead - Hours ahead to filter
     * @returns {Array} Filtered upcoming homework
     */
    filterUpcomingHomework(homework, hoursAhead) {
        const now = new Date();
        const futureTime = now.getTime() + (hoursAhead * 60 * 60 * 1000);
        
        return homework.filter(hw => {
            // Convert WebUntis date format to JavaScript Date
            const dueDate = this.parseWebUntisDate(hw.dueDate);
            return dueDate && dueDate.getTime() <= futureTime && dueDate.getTime() > now.getTime() && !hw.completed;
        });
    }

    /**
     * Parse WebUntis date format (YYYYMMDD) to JavaScript Date
     * @param {number} date - Date in YYYYMMDD format
     * @returns {Date} JavaScript Date object
     */
    parseWebUntisDate(date) {
        if (!date) return null;
        
        const dateStr = date.toString();
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1; // Month is 0-indexed
        const day = parseInt(dateStr.substring(6, 8));
        
        return new Date(year, month, day);
    }

    /**
     * Trigger all notification callbacks
     * @param {Array} events - Events to notify about
     */
    triggerNotifications(events) {
        this.notificationCallbacks.forEach(callback => {
            try {
                callback(events);
            } catch (error) {
                console.error('Notification callback error:', error);
            }
        });
    }

    /**
     * Start periodic checking for events
     * @param {number} intervalMinutes - Check interval in minutes
     * @param {number} hoursAhead - Hours ahead to check
     * @returns {number} Interval ID
     */
    startPeriodicCheck(intervalMinutes = 30, hoursAhead = 24) {
        return setInterval(async () => {
            await this.checkUpcomingEvents(hoursAhead);
        }, intervalMinutes * 60 * 1000);
    }

    /**
     * Stop periodic checking
     * @param {number} intervalId - Interval ID to clear
     */
    stopPeriodicCheck(intervalId) {
        clearInterval(intervalId);
    }
}

// Export classes for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        WebUntisAPI, 
        EventNotificationManager,
        getWebUntisApiInstance,
        clearWebUntisApiInstance,
        testWebUntisAPI
    };
}

/**
 * Global API instance manager for reusing connections
 */
let globalAPIInstance = null;
let globalConfigHash = null;

/**
 * Get or create a WebUntis API instance with session reuse
 * @param {Object} config - WebUntis configuration object
 * @returns {Promise<WebUntisAPI>} API instance
 */
async function getWebUntisApiInstance(config) {
    if (!config) {
        throw new Error('Config parameter is required');
    }
    
    // Create a hash of the config to detect changes
    const configHash = JSON.stringify({
        school: config.school,
        username: config.username,
        password: config.password,
        server: config.server
    });
    
    // If config changed or no instance exists, create new one
    if (!globalAPIInstance || globalConfigHash !== configHash || !globalAPIInstance.sessionId) {
        globalAPIInstance = new WebUntisAPI(config);
        globalConfigHash = configHash;
        
        // Authenticate the new instance
        if (!(await globalAPIInstance.authenticate())) {
            throw new Error('Authentication failed');
        }
    }

    return globalAPIInstance;
}

/**
 * Clear the global API instance (useful for cleanup or forcing re-authentication)
 */
async function clearWebUntisApiInstance() {
    if (globalAPIInstance) {
        try {
            await globalAPIInstance.logout();
        } catch (error) {
            console.warn('Warning during logout:', error.toString());
        }
    }
    globalAPIInstance = null;
    globalConfigHash = null;
}

/**
 * Example usage functions
 */

/**
 * Test function
 * @param {Object} config - WebUntis configuration object
 * @param {boolean} forceLogout - Whether to force logout after test (default: false)
 */
async function testWebUntisAPI(config, forceLogout = false) {
    // Use provided config or default values for testing purposes
    if (!config) {
        console.warn('No config provided - using default test config. Please provide your actual credentials for real usage.');
        config = {
            school: '<YOUR_SCHOOL_NAME>',        // Replace with your school name
            username: '<YOUR_USERNAME>',         // Replace with your username
            password: '<YOUR_PASSWORD>',         // Replace with your password
            server: '<YOUR_WEBUNTIS_SERVER>'     // Replace with your school's WebUntis server if different
        };
    }

    try {
        // Get or reuse API instance
        const api = await getWebUntisApiInstance(config);
        
        console.log('Authentication successful');
        
        // Get formatted homework for next 5 days
        const homework = await api.getFormattedHomework(5, true);
        console.log('Homework for next 5 days:');
        console.log(homework);
        
        // Optionally logout if requested
        if (forceLogout) {
            await api.logout();
            await clearWebUntisApiInstance();
            console.log('Logged out and cleared instance');
        }
        
        console.log('Test completed successfully');
        
    } catch (error) {
        console.error('Error:', error.toString());
        throw error;
    }
}