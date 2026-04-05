// observer.js script structure integrated into exporter.js
// Inject ICS export button into schedule toolbar

const observer = new MutationObserver((mutations) => {
    if (!window.location.pathname.includes('/scheduler')) return;

    const toolbar = document.querySelector('#schedules > section > mat-toolbar');
    if (toolbar && !document.getElementById('export-ics-btn')) {
        injectExportButton(toolbar);
    }
});

// Since UW Madison uses Angular, we watch the body for subtree modification to reliably catch DOM loads
observer.observe(document.body, { childList: true, subtree: true });

function injectExportButton(container) {
    const btn = document.createElement('button');
    btn.id = 'export-ics-btn';
    btn.innerText = 'Export ICS';

    // Style to match material design look with UW Madison red theme
    btn.style.cssText = `
        background-color: #c5050c; /* UW Red */
        color: white;
        border: none;
        border-radius: 4px;
        height: 36px;
        font-family: Roboto, "Helvetica Neue", sans-serif;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        box-shadow: 0 3px 1px -2px rgba(0,0,0,.2), 0 2px 2px 0 rgba(0,0,0,.14), 0 1px 5px 0 rgba(0,0,0,.12);
        transition: background-color 0.2s;
    `;
    btn.onmouseover = () => btn.style.backgroundColor = '#9e040a';
    btn.onmouseout = () => btn.style.backgroundColor = '#c5050c';

    btn.addEventListener('click', handleExport);
    container.appendChild(btn);
}

function getTermCode() {
    // 1. Check URL parameters
    const params = new URLSearchParams(window.location.search);
    if (params.get('termCode')) return params.get('termCode');
    if (params.get('term')) return params.get('term');

    // 2. Scan document for mat-select containing season text
    let termText = "";
    const selects = document.querySelectorAll('mat-select');
    for (const s of selects) {
        if (s.innerText.match(/(Spring|Summer|Fall)\s+20\d\d/i)) {
            termText = s.innerText.trim();
            break;
        }
    }

    // Fallback: search the entire innerText
    if (!termText) {
        const match = document.body.innerText.match(/(Spring|Summer|Fall)\s+(20\d\d)/i);
        if (match) termText = match[0];
    }

    if (termText) {
        const match = termText.match(/(Spring|Summer|Fall)\s+(20\d\d)/i);
        if (match) {
            const season = match[1].toLowerCase();
            const year = parseInt(match[2], 10);

            let termDigit = 4;
            let yy = year.toString().slice(-2);

            if (season === 'fall') {
                termDigit = 2;
                yy = (year + 1).toString().slice(-2); // Fall is acad year starting in yyyy, ends in yyyy+1
            } else if (season === 'summer') {
                termDigit = 6;
            }
            return "1" + yy + termDigit;
        }
    }

    // Default Fallback: base estimation purely on JS Date
    const now = new Date();
    const currentYear = now.getFullYear();
    const month = now.getMonth();

    let yy, termDigit;
    if (month >= 8) { // Fall (Sep+)
        termDigit = 2;
        yy = (currentYear + 1).toString().slice(-2);
    } else if (month >= 5) { // Summer (Jun-Aug)
        termDigit = 6;
        yy = currentYear.toString().slice(-2);
    } else { // Spring (Jan-May)
        termDigit = 4;
        yy = currentYear.toString().slice(-2);
    }
    return "1" + yy + termDigit;
}

// Maps textual days to JS Date integer values and ICS short-strings
const DayMap = {
    "SUNDAY": { idx: 0, ics: "SU" },
    "MONDAY": { idx: 1, ics: "MO" },
    "TUESDAY": { idx: 2, ics: "TU" },
    "WEDNESDAY": { idx: 3, ics: "WE" },
    "THURSDAY": { idx: 4, ics: "TH" },
    "FRIDAY": { idx: 5, ics: "FR" },
    "SATURDAY": { idx: 6, ics: "SA" }
};

// Returns standard bounds based on Madison's usual term codes 
function getSemesterBounds(termCode) {
    const termDigit = termCode.slice(-1);
    const yy = parseInt(termCode.slice(1, 3), 10);
    // the "Year" in YY is the year of the Spring semester (end of academic year)
    const year = 2000 + yy - (termDigit === '2' ? 1 : 0);

    let baseStartMonth, baseStartDate, baseEndMonth, baseEndDate;
    if (termDigit === '4') { // Spring: approx Jan 20 to May 10
        [baseStartMonth, baseStartDate] = [0, 20]; // 0-indexed month
        [baseEndMonth, baseEndDate] = [4, 10];
    } else if (termDigit === '6') { // Summer: approx Jun 15 to Aug 10
        [baseStartMonth, baseStartDate] = [5, 15];
        [baseEndMonth, baseEndDate] = [7, 10];
    } else { // Fall: approx Sep 2 to Dec 15
        [baseStartMonth, baseStartDate] = [8, 2];
        [baseEndMonth, baseEndDate] = [11, 15];
    }
    return { year, baseStartMonth, baseStartDate, baseEndMonth, baseEndDate };
}

// Shifts a date forward until it lands on one of the daysOfWeek (necessary for ICS first recurrence)
function findFirstMatchingDate(year, month, date, daysOfWeekArr) {
    let d = new Date(year, month, date);
    if (!daysOfWeekArr || daysOfWeekArr.length === 0) return d;

    const allowedMap = daysOfWeekArr.map(dayStr => DayMap[dayStr].idx);
    while (!allowedMap.includes(d.getDay())) {
        d.setDate(d.getDate() + 1);
    }
    return d;
}

function pad(num) {
    return String(num).padStart(2, '0');
}

// Helper to get time in UTC format for DTSTAMP/UNTIL
function getUtcStamp(dateObj = new Date()) {
    return `${dateObj.getUTCFullYear()}${pad(dateObj.getUTCMonth() + 1)}${pad(dateObj.getUTCDate())}T${pad(dateObj.getUTCHours())}${pad(dateObj.getUTCMinutes())}${pad(dateObj.getUTCSeconds())}Z`;
}

// Converts date and generic milliseconds-from-midnight into floating local timezone ICS format
function toIcsFormat(dateObj, msFromMidnight) {
    if (msFromMidnight === undefined) {
        return `${dateObj.getFullYear()}${pad(dateObj.getMonth() + 1)}${pad(dateObj.getDate())}T${pad(dateObj.getHours())}${pad(dateObj.getMinutes())}${pad(dateObj.getSeconds())}`;
    }

    // Madison's backend returns UTC offset representing CST standard time, meaning we uniformly subtract 6 hours.
    let localMs = msFromMidnight - (6 * 3600 * 1000);
    if (localMs < 0) localMs += 24 * 3600 * 1000;

    const totalMins = Math.floor(localMs / 60000);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;

    return `${dateObj.getFullYear()}${pad(dateObj.getMonth() + 1)}${pad(dateObj.getDate())}T${pad(hrs)}${pad(mins)}00`;
}

async function handleExport() {
    const btn = document.getElementById('export-ics-btn');
    const originalText = btn.innerText;
    btn.innerText = 'Exporting...';
    btn.disabled = true;

    try {
        const termCode = getTermCode();
        const url = `https://enroll.wisc.edu/scheduling/results?termCode=${termCode}`;

        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include'
        });

        if (!response.ok) throw new Error("Failed to fetch schedule");

        const data = await response.json();
        const icsString = generateIcs(data, termCode);

        // Finalize standard browser Blob download
        const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Badger_Schedule_${termCode}.ics`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        btn.innerText = 'Exported!';
    } catch (err) {
        console.error(err);

        // Because content scripts run in 'Isolated Worlds', native classes like `SyntaxError` can sometimes fail an `instanceof` check. 
        // We match via the error name or message instead:
        if (err.name === 'SyntaxError' || (err.message && err.message.includes('JSON'))) {
            window.alert('Generate the schedule first!');
            btn.innerText = 'No Schedule!';
        } else {
            btn.innerText = 'Error (See console)';
        }

        btn.style.backgroundColor = '#999';
    }


    setTimeout(() => {
        btn.innerText = originalText;
        btn.disabled = false;
        btn.style.backgroundColor = '#c5050c';
    }, 2500);
}

function generateIcs(scheduleData, termCode) {
    let lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Badger Course Watch//EN",
        "BEGIN:VTIMEZONE",
        "TZID:America/Chicago",
        "X-LIC-LOCATION:America/Chicago",
        "BEGIN:DAYLIGHT",
        "TZOFFSETFROM:-0600",
        "TZOFFSETTO:-0500",
        "TZNAME:CDT",
        "DTSTART:19700308T020000",
        "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
        "END:DAYLIGHT",
        "BEGIN:STANDARD",
        "TZOFFSETFROM:-0500",
        "TZOFFSETTO:-0600",
        "TZNAME:CST",
        "DTSTART:19701101T020000",
        "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
        "END:STANDARD",
        "END:VTIMEZONE"
    ];

    const bounds = getSemesterBounds(termCode);

    // Per RFC 5545, since DTSTART is local time with a timezone ref, UNTIL MUST be in UTC. 
    // We append 1 safety day buffer past the bounds to make sure the final class repeats.
    const endSemesterUtc = new Date(Date.UTC(bounds.year, bounds.baseEndMonth, bounds.baseEndDate + 1, 6, 0, 0));
    const endSemesterIcs = getUtcStamp(endSemesterUtc);

    const entities = scheduleData.bestSolution?.schedulingEntities || [];

    for (const ent of entities) {
        if (!ent.selectedEnrollmentPackage) continue;
        const className = (ent.subjectShortDescription && ent.catalogNumber) ? `${ent.subjectShortDescription} ${ent.catalogNumber}` : (ent.name || 'Course');

        const meetings = ent.selectedEnrollmentPackage.meetings || [];
        const exams = ent.selectedEnrollmentPackage.exams || [];

        for (const m of meetings) {
            // Check if online or unscheduled via zeros in start/end
            if (m.meetingTimeStart === 0 && m.meetingTimeEnd === 0) continue;

            const days = m.daysOfWeek || [];
            const rruleDaysStr = days.map(d => DayMap[d].ics).join(',');

            const firstDate = findFirstMatchingDate(bounds.year, bounds.baseStartMonth, bounds.baseStartDate, days);

            const dtStart = toIcsFormat(firstDate, m.meetingTimeStart);
            const dtEnd = toIcsFormat(firstDate, m.meetingTimeEnd);

            const location = m.building ? `${m.buildingName} ${m.room}`.trim() : "ONLINE";
            const uid = crypto.randomUUID();

            lines.push("BEGIN:VEVENT");
            lines.push(`UID:${uid}`);
            lines.push(`DTSTAMP:${getUtcStamp()}`);
            lines.push(`DTSTART;TZID=America/Chicago:${dtStart}`);
            lines.push(`DTEND;TZID=America/Chicago:${dtEnd}`);
            if (rruleDaysStr) {
                lines.push(`RRULE:FREQ=WEEKLY;UNTIL=${endSemesterIcs};BYDAY=${rruleDaysStr}`);
            }
            lines.push(`SUMMARY:${className}`);
            lines.push(`LOCATION:${location}`);
            lines.push("END:VEVENT");
        }

        for (const m of exams) {
            if (m.examDate === 0) continue;

            // Exams specify absolute date stamps representing midnight local times
            const examD = new Date(m.examDate);
            const dtStart = toIcsFormat(examD, m.meetingTimeStart);
            const dtEnd = toIcsFormat(examD, m.meetingTimeEnd);

            const location = m.building ? `${m.buildingName} ${m.room}`.trim() : "PENDING";
            const uid = crypto.randomUUID();

            lines.push("BEGIN:VEVENT");
            lines.push(`UID:${uid}`);
            lines.push(`DTSTAMP:${getUtcStamp()}`);
            lines.push(`DTSTART;TZID=America/Chicago:${dtStart}`);
            lines.push(`DTEND;TZID=America/Chicago:${dtEnd}`);
            lines.push(`SUMMARY:${className} EXAM`);
            lines.push(`LOCATION:${location}`);
            lines.push("END:VEVENT");
        }
    }

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
}
