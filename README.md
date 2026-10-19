# WebUntis Automation

A comprehensive WebUntis API wrapper with Google Apps Script and Home Assistant integration for automated homework notifications and timetable management.

## Features

- **WebUntis API Access**: Complete homework and timetable retrieval
- **Google Apps Script Integration**: Email notifications and calendar sync
- **Google Sheet Sync**: Writes Lehrstoff and Hausübung of past lessons into a class spreadsheet
- **Home Assistant Integration**: Smart home notifications and automation
- **Session Management**: Efficient API connection reuse
- **Flexible Deployment**: Works in both Node.js and Google Apps Script environments

## Quick Start

1. **Configure credentials** in the respective JavaScript files
2. **Choose your deployment method**:
   - **Google Apps Script**: See [Google Apps Script Deployment Guide](docs/GOOGLE_APPS_SCRIPT_DEPLOYMENT.md)
   - **Node.js**: Use the files directly with `node` command

## Common Issues

### Google Apps Script: "api.getHomeworkList is not a function"

**Solution**: You need to copy **both** `WebUntis.js` and `Google.js` content to your Google Apps Script project:

1. Create `WebUntis.gs` - copy entire content from `WebUntis.js`
2. Create `Google.gs` - copy entire content from `Google.js`
3. Both files must be in the same Google Apps Script project

**Why**: Google Apps Script functions need to be in the same project to call each other. The `sendHomeworkEmail()` function in `Google.js` depends on functions from `WebUntis.js`.

See the [full deployment guide](docs/GOOGLE_APPS_SCRIPT_DEPLOYMENT.md) for complete setup instructions.

## Files Structure

### Shared Files (Node.js and Google Apps Script)
- `WebUntis.js` - WebUntis API wrapper and session management
- `Google.js` - Google services integration (Gmail, Calendar)
- `Sheets.js` - Lehrstoff/Hausübung sync to a Google Sheet (client of the web app)
- `HomeAssistant.js` - Home Assistant integration
- `Sms.js` - Open homework as SMS via SMS Gateway for Android

### Node.js and Apps Script Entry Points
- `StartNode.js` - Node.js CLI (`node StartNode.js help`)
- `config.template.js` - Documented Node.js configuration (copy to `config.js`)
- `Code.gs` - Apps Script entry points (`runDaily()`, `quickTest()`, ...); secrets go into Script Properties
- `SheetWebApp.js` - Separate web app bound to the class spreadsheet that writes the cells (only needs access to that one sheet)

## Documentation

All documentation is located in the `docs/` directory:

- **[Project Structure](docs/PROJECT_STRUCTURE.md)** - Complete project architecture overview
- **[Google Apps Script Deployment](docs/GOOGLE_APPS_SCRIPT_DEPLOYMENT.md)** - Step-by-step deployment guide

## Key Features

- **Dual Environment Support** - Works in both Google Apps Script and Node.js
- **Smart Session Management** - Reuses authentication sessions for efficiency
- **Separate Calendar Organization** - Dedicated calendars for homework and timetable
- **Email Notifications** - HTML-formatted homework summaries
- **Home Assistant Integration** - Smart home notifications and automation
- **Error Handling** - Comprehensive error management and logging
- **Easy Configuration** - Template-based setup with clear instructions

## Configuration

Update the configuration objects in each file with your actual credentials:

```javascript
const MY_CONFIG = {
    school: 'your-school-name',
    username: 'your-username',
    password: 'your-password',
    server: 'your-webuntis-server',
    resourceId: 'your-student-resource-id' // For timetable functionality
};
```

## Usage Examples

### Basic Homework Retrieval
```javascript
const api = getWebUntisApiInstance(MY_CONFIG);
const homework = await api.getHomeworkList(7, true); // Next 7 days, open only
console.log(homework);
```

### Google Apps Script Integration
```javascript
// Send homework email notifications
sendHomeworkEmail(MY_CONFIG, 'student@email.com', 5);

// Sync homework to calendar (full workflow)
syncHomeworkToCalendar(MY_CONFIG, CALENDAR_CONFIG.homework.calendarId, CALENDAR_CONFIG.homework.syncDaysAhead);

// Sync timetable to calendar (full workflow)
syncTimetableToCalendarWorkflow(MY_CONFIG, CALENDAR_CONFIG.timetable.calendarId, CALENDAR_CONFIG.timetable.syncDaysAhead);
```

### Home Assistant Integration
```javascript
// Send notification
await sendHomeworkToHomeAssistant(MY_CONFIG, HA_CONFIG, 3);
```

## Quick Start

### For Google Apps Script
1. Copy `WebUntis.js`, `Google.js`, `Sheets.js` and `Code.gs` to a Google Apps Script project (see the [deployment guide](docs/GOOGLE_APPS_SCRIPT_DEPLOYMENT.md))
2. Update the non-secret settings in `Code.gs` and add the credentials as Script Properties (Project Settings → Script Properties)
3. Run `quickTest()` to check the login, then `runDaily()`

### For Node.js
1. Install dependencies: `npm install`
2. Copy `config.template.js` to `config.js` and add your credentials
3. Run: `node StartNode.js`

Run single actions with `node StartNode.js <action ...> [--days N]`:
- `email` - Send homework email
- `homework` - Sync homework to Google Calendar
- `ha` - Send Home Assistant notification
- `sms` - Send the open homework as SMS (see below)
- `timetable` - Sync timetable to Google Calendar
- `lessons` - Write Lehrstoff and Hausübung to the Google Sheet (`--days 30` for the last 30 days)
- `teachers` - Write the teacher names to the Google Sheet
- `sheet` - Same as `lessons teachers`
- `all` - All configured actions

Example: `node StartNode.js lessons teachers --days 14`. Add `--overwrite` to replace the sheet cells (and teacher names) with the WebUntis data instead of only appending what is missing (needs the current `SheetWebApp.js` deployed). Add `--verbose` for detailed logs (skipped lessons and homework, teacher names, every sheet cell and calendar event written or skipped). Without action, the actions listed in `ACTIONS` in `config.js` are run (all configured ones if it is not set).

SMS: the open homework (compact, without emojis and due dates) is sent from your own Android phone with the open-source app [SMS Gateway for Android](https://sms-gate.app), so the SMS costs what your tariff charges. Install the app on a phone that stays switched on, start it in Cloud mode and put the username and password from its Home tab plus the recipients (`+43...`) into `SMS_CONFIG`. Test it with your own number first: `node StartNode.js sms --verbose`.

### Installing Node.js as a local user with nvm (e.g. Raspberry Pi)

If Node.js is not installed system-wide, install it for your user with [nvm](https://github.com/nvm-sh/nvm)
(no `sudo` needed, everything goes into `~/.nvm`):
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash   # check the latest version on GitHub
source ~/.bashrc                 # or open a new terminal, so the nvm command is available
nvm install --lts                # current LTS version
nvm alias default 'lts/*'        # use it in every new shell
node --version && npm --version
```

Then install the dependencies in the repository folder and test the setup:
```bash
cd /path/to/WebUntis-automation
npm install
cp config.template.js config.js  # add your credentials
node StartNode.js test
```

nvm only sets up `PATH` in interactive shells, so systemd does not find `node`, and the real path
(`~/.nvm/versions/node/v<version>/bin/node`) changes with every Node.js update. Create a stable link to use in the
service file:
```bash
mkdir -p ~/.local/bin
ln -sf "$(nvm which default)" ~/.local/bin/node
~/.local/bin/node --version
```
In `webuntis-automation.service` below, replace `/usr/bin/node` with `/home/<user>/.local/bin/node` (or `%h/.local/bin/node`).
After a Node.js update (`nvm install --lts --reinstall-packages-from=current`), run the `ln -sf` command again and
`npm install` in the repository folder; old versions can be removed with `nvm uninstall <version>`.

### Scheduled runs with a systemd user timer (Linux)

To run the actions automatically on your own computer, e.g. every weekday at 14:30, create two files in
`~/.config/systemd/user/` (replace `/path/to/WebUntis-automation`, check the node path with `which node`; with nvm
use the link from the section above).

`webuntis-automation.service`:
```ini
[Unit]
Description=Run WebUntis Automation
# At most 3 starts (first run + 2 retries) per hour, so a permanent error does not loop forever
StartLimitIntervalSec=1h
StartLimitBurst=3

[Service]
Type=oneshot
WorkingDirectory=/path/to/WebUntis-automation
# Wait until NetworkManager reports a connection (e.g. after resume from suspend)
ExecStartPre=/usr/bin/nm-online --quiet --timeout=60
# Sheet sync first; the email only runs if it succeeded (a failed ExecStart skips the following ones)
ExecStart=/usr/bin/node /path/to/WebUntis-automation/StartNode.js lessons
ExecStart=/usr/bin/node /path/to/WebUntis-automation/StartNode.js email
# Covers ExecStartPre and all ExecStart lines together, so it must be longer than the nm-online timeout
TimeoutStartSec=180
Restart=on-failure
RestartSec=5min
```

`webuntis-automation.timer`:
```ini
[Unit]
Description=Run WebUntis Automation every weekday at 14:30

[Timer]
OnCalendar=Mon..Fri *-*-* 14:30:00
# Catch up a missed run when the computer was off at 14:30
Persistent=true
AccuracySec=1s

[Install]
WantedBy=timers.target
```

Deploy and test:
```bash
loginctl enable-linger $USER                           # once: run user timers without being logged in (e.g. Raspberry Pi)
systemctl --user daemon-reload                         # reload after creating or changing the unit files
systemctl --user enable --now webuntis-automation.timer
systemctl --user start webuntis-automation.service     # run once now to test (sends the email!)
systemctl --user list-timers --all                     # check the next run
journalctl --user -u webuntis-automation.service -e    # logs
```

Notes:
- Actions in a single `node StartNode.js lessons email` call always run in a fixed order with `email` first. If `lessons`
  then fails, the exit code is 1 and `Restart=on-failure` sends the email again on every retry. Separate `ExecStart`
  lines run in order and stop at the first failure, so the email is only sent after `lessons` worked. A retry after a
  failed email runs `lessons` again, which is safe because it only appends what is missing.
- Without `loginctl enable-linger $USER`, user timers only run while you are logged in (use `sudo` if it fails with
  a permission error). Lingering is stored as an empty file per user in `/var/lib/systemd/linger/`. To check it:
  ```bash
  loginctl show-user $USER -p Linger                       # Linger=yes
  ls /var/lib/systemd/linger/                              # file with your username
  systemctl status user@$(id -u).service                   # after a reboot without login: active (running)
  ```
  To check that a scheduled run happened without a login, reboot, don't log in until after the next run time, then
  compare the run time with your first login:
  ```bash
  systemctl --user list-timers --all                       # LAST column = time of the last run
  journalctl --user -u webuntis-automation.service -e      # log output with timestamps
  last -n 3 $USER                                          # your login times
  ```
  An SSH login also starts the user manager, so only runs before the first login after the reboot prove it works.
- If the computer is suspended at 14:30, the run starts right after resume; with `Persistent=true` a run missed while
  the computer was off starts after the next boot (possibly on a weekend).
- `nm-online` needs NetworkManager. Without it, drop the `ExecStartPre` line and rely on the retries.

Shortcuts:
- `npm start` - Run the default actions
- `npm test` - Show configuration status and test the WebUntis login
- `npm run quick` - Print open homework
- `npm run sheet` - Same as `node StartNode.js sheet`

## License

Apache License 2.0 - see [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

For questions and support, please refer to the documentation in the `docs/` directory or create an issue on GitHub.