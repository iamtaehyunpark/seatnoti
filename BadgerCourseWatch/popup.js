import { TERMS, SUBJECTS } from './dictionaries.js';

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  populateDropdowns();
  loadWatchlist();
  setupTabs();
  setupSearch();
  setupCredits();
});

// --- DOM Elements ---
const views = { watch: document.getElementById('view-watch'), search: document.getElementById('view-search'), credits: document.getElementById('view-credits') };
const tabs = { watch: document.getElementById('tab-watch'), search: document.getElementById('tab-search') };
const searchResultsDiv = document.getElementById('search-results');
const sectionResultsDiv = document.getElementById('section-results');
const sectionListDiv = document.getElementById('section-list');
let currentSelectedCourse = null;

// --- Setup Functions ---
function populateDropdowns() {
  const termSelect = document.getElementById('search-term');
  const subjectSelect = document.getElementById('search-subject');

  TERMS.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.value;
    opt.textContent = t.label;
    termSelect.appendChild(opt);
  });

  const defaultOpt = document.createElement('option');
  defaultOpt.value = "";
  defaultOpt.textContent = "All Subjects (None)";
  subjectSelect.appendChild(defaultOpt);

  SUBJECTS.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.value;
    opt.textContent = s.label;
    subjectSelect.appendChild(opt);
  });
}

function setupTabs() {
  tabs.watch.addEventListener('click', () => switchView('watch'));
  tabs.search.addEventListener('click', () => switchView('search'));
}

function setupCredits() {
  const creditsBtn = document.getElementById('btn-credits');
  if (creditsBtn) {
    creditsBtn.addEventListener('click', () => {
      switchView('credits');
    });
  }
}

function switchView(viewName) {
  views.watch.classList.toggle('hidden', viewName !== 'watch');
  views.watch.classList.toggle('active', viewName === 'watch');
  views.search.classList.toggle('hidden', viewName !== 'search');
  views.search.classList.toggle('active', viewName === 'search');
  views.credits.classList.toggle('hidden', viewName !== 'credits');
  views.credits.classList.toggle('active', viewName === 'credits');

  tabs.watch.classList.toggle('active', viewName === 'watch');
  tabs.search.classList.toggle('active', viewName === 'search');

  if (viewName === 'watch') loadWatchlist();

  if (viewName === 'credits') {
    const iframe = document.getElementById('kofiframe');
    if (iframe && !iframe.src && iframe.dataset.src) {
      iframe.src = iframe.dataset.src;
    }
  }
}

// --- Helpers for Time/Date ---
function formatTime(ms) {
  if (!ms && ms !== 0) return '';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  const displayMin = minutes < 10 ? '0' + minutes : minutes;
  return `${displayHour}:${displayMin} ${ampm}`;
}

function formatDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
}

// --- Search Logic ---
function setupSearch() {
  document.getElementById('btn-search').addEventListener('click', performSearch);
  document.getElementById('btn-back').addEventListener('click', () => {
    sectionResultsDiv.classList.add('hidden');
    searchResultsDiv.classList.remove('hidden');
    searchResultsDiv.innerHTML = '';
    document.getElementById('status-msg').textContent = '';
    // Clear the section search result under "Select Sections"
    document.getElementById('section-list').innerHTML = '';
  });
  document.getElementById('btn-add-watch').addEventListener('click', addToWatchlist);
}

async function performSearch() {
  const term = document.getElementById('search-term').value;
  const subject = document.getElementById('search-subject').value;
  const keyword = document.getElementById('search-keyword').value;
  const statusMsg = document.getElementById('status-msg');

  statusMsg.textContent = "Searching...";
  searchResultsDiv.innerHTML = '';
  sectionResultsDiv.classList.add('hidden');

  const filters = [];
  if (subject) {
    filters.push({ term: { "subject.subjectCode": subject } });
  }

  try {
    const payload = {
      selectedTerm: term,
      queryString: keyword,
      filters: filters,
      page: 1,
      pageSize: 50,
      sortOrder: "SCORE"
    };

    const response = await fetch("https://enroll.wisc.edu/api/search/v1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("Search failed. Ensure you are logged into enroll.wisc.edu");

    const data = await response.json();
    statusMsg.textContent = "";

    if (data.hits && data.hits.length > 0) {
      renderSearchResults(data.hits);
    } else {
      searchResultsDiv.innerHTML = '<p>No courses found.</p>';
    }

  } catch (err) {
    console.error(err);
    statusMsg.textContent = "Error: " + err.message;
    window.open('https://enroll.wisc.edu/', '_blank');
  }
}

function renderSearchResults(hits) {
  searchResultsDiv.classList.remove('hidden');
  searchResultsDiv.innerHTML = '';

  hits.forEach(hit => {
    const div = document.createElement('div');
    div.className = 'course-item';

    let courseTitle = hit.title;
    if (hit.topics && hit.topics.length > 0) {
      courseTitle = `${hit.title}: ${hit.topics[0].shortDescription}`;
    }

    div.innerHTML = `
      <strong>${hit.courseDesignation}</strong><br>
      <span style="font-size: 0.9em;">${courseTitle}</span>
    `;

    div.addEventListener('click', () => loadSections(hit));
    searchResultsDiv.appendChild(div);
  });
}

async function loadSections(courseHit) {
  const statusMsg = document.getElementById('status-msg');
  statusMsg.textContent = "Loading sections...";

  let fullCourseName = `${courseHit.courseDesignation}: ${courseHit.title}`;
  if (courseHit.topics && courseHit.topics.length > 0) {
    fullCourseName = `${courseHit.courseDesignation}: ${courseHit.topics[0].shortDescription}`;
  }

  currentSelectedCourse = {
    termCode: courseHit.termCode,
    subjectCode: courseHit.subject.subjectCode,
    courseId: courseHit.courseId,
    courseName: fullCourseName
  };

  try {
    const url = `https://enroll.wisc.edu/api/search/v1/enrollmentPackages/${currentSelectedCourse.termCode}/${currentSelectedCourse.subjectCode}/${currentSelectedCourse.courseId}`;
    const response = await fetch(url);
    const sections = await response.json();

    statusMsg.textContent = "";
    renderSections(sections);

  } catch (err) {
    console.error(err);
    statusMsg.textContent = "Error loading sections.";
  }
}

function renderSections(packages) {
  const sectionResultsDiv = document.getElementById('section-results');
  const searchResultsDiv = document.getElementById('search-results');
  const sectionListDiv = document.getElementById('section-list');

  searchResultsDiv.classList.add('hidden');
  sectionResultsDiv.classList.remove('hidden');
  sectionListDiv.innerHTML = '';

  packages.forEach(pkg => {
    let targetSec = pkg.sections.find(s => s.classUniqueId.classNumber === pkg.enrollmentClassNumber);

    if (!targetSec && pkg.sections.length > 0) {
      targetSec = pkg.sections[0];
    }

    if (!targetSec) return;

    // --- EXTRACT MEETING INFO ---
    let meetingInfo = '<span style="color:#666; font-style:italic;">No meeting time</span>';

    if (targetSec.classMeetings && targetSec.classMeetings.length > 0) {
      const meetings = targetSec.classMeetings.filter(m => m.meetingType === 'CLASS');

      if (meetings.length > 0) {
        meetingInfo = meetings.map(m => {
          const days = m.meetingDays || '';
          const time = `${formatTime(m.meetingTimeStart)} - ${formatTime(m.meetingTimeEnd)}`;
          //const dates = `${formatDate(m.startDate)} to ${formatDate(m.endDate)}`;
          return `<div>${days} ${time}<br></div>`; // <span style="font-size:0.85em; color:#888;">${dates}</span></div>`;
        }).join('');
      }
    }
    // ----------------------------

    const enrollment = targetSec.enrollmentStatus;
    const seats = enrollment.openSeats;
    const waitlistOpen = enrollment.openWaitlistSpots;

    let status = "CLOSED";
    if (seats > 0) {
      status = "OPEN";
    } else if (waitlistOpen > 0) {
      status = "WAITLISTED";
    }

    const row = document.createElement('div');
    row.className = 'section-row';

    // We use encodeURIComponent to safely store the HTML string in a data attribute
    row.innerHTML = `
      <label>
        <input type="checkbox" 
               value="${pkg.enrollmentClassNumber}" 
               data-section="${targetSec.sectionNumber}" 
               data-type="${targetSec.type}"
               data-status="${status}" 
               data-seats="${seats}"
               data-meetings="${encodeURIComponent(meetingInfo)}"> 
        <div class="section-details">
          <strong>${targetSec.type} ${targetSec.sectionNumber}</strong><br>
          ${meetingInfo}
          <div style="margin-top:4px;">Status: <span class="status-badge status-${status}">${status}</span> (${seats} seats)</div>
        </div>
      </label>
    `;
    sectionListDiv.appendChild(row);
  });
}

function addToWatchlist() {
  const sectionListDiv = document.getElementById('section-list');
  const checkboxes = sectionListDiv.querySelectorAll('input[type="checkbox"]:checked');

  if (checkboxes.length === 0) return;

  chrome.storage.local.get(['watchlist'], (result) => {
    const watchlist = result.watchlist || [];
    let addedCount = 0;

    checkboxes.forEach(cb => {
      if (watchlist.length >= 10) {
        alert("Limit reached (Max 10 courses).");
        return;
      }

      const sectionNum = cb.getAttribute('data-section');
      const sectionType = cb.getAttribute('data-type');

      // Decode the stored HTML string for meetings
      const meetingsHtml = decodeURIComponent(cb.getAttribute('data-meetings'));

      const uniqueId = `${currentSelectedCourse.termCode}-${cb.value}`;

      if (!watchlist.find(item => item.uniqueId === uniqueId)) {
        watchlist.push({
          uniqueId: uniqueId,
          termCode: currentSelectedCourse.termCode,
          subjectCode: currentSelectedCourse.subjectCode,
          courseId: currentSelectedCourse.courseId,
          courseName: currentSelectedCourse.courseName,
          sectionNumber: sectionNum,
          sectionType: sectionType,
          meetingDetails: meetingsHtml, // Save it to storage
          lastStatus: cb.getAttribute('data-status'),
          lastSeats: cb.getAttribute('data-seats'),
          enrollmentClassNumber: parseInt(cb.value),
          notificationMode: 'ALL' // Default: Notify for everything
        });
        addedCount++;
      }
    });

    chrome.storage.local.set({ watchlist }, () => {
      //document.getElementById('status-msg').textContent = `Added ${addedCount} sections.`;
      switchView('watch');
      chrome.runtime.sendMessage({ action: "CHECK_NOW" });
    });
  });
}

function loadWatchlist() {
  const container = document.getElementById('watchlist-container');

  chrome.storage.local.get(['watchlist'], (result) => {
    const watchlist = result.watchlist || [];
    container.innerHTML = '';

    if (watchlist.length === 0) {
      container.innerHTML = '<p class="empty-msg">No courses being watched.</p>';
      return;
    }
    watchlist.forEach(item => {
      // --- MIGRATION Logic on read ---
      if (!item.notificationMode) {
        if (item.isMuted) {
          item.notificationMode = 'NONE';
        } else if (item.isWaitlistMuted) {
          item.notificationMode = 'OPEN_ONLY';
        } else {
          item.notificationMode = 'ALL';
        }
      }
      // -------------------------------

      const div = document.createElement('div');
      const isMuted = item.notificationMode === 'NONE';
      div.className = `watch-item ${isMuted ? 'muted' : ''}`;

      // Determine selected state for dropdown
      const selAll = item.notificationMode === 'ALL' ? 'selected' : '';
      const selOpen = item.notificationMode === 'OPEN_ONLY' ? 'selected' : '';
      const selWait = item.notificationMode === 'WAITLIST_ONLY' ? 'selected' : '';
      const selNone = item.notificationMode === 'NONE' ? 'selected' : '';

      div.innerHTML = `
        <div class="watch-info">
          <h4>${item.courseName}</h4>
          <strong>${item.sectionType || 'Sec'} ${item.sectionNumber}</strong>
          <div style="font-size: 11px; color: #555; margin-top: 2px; line-height: 1.3;">
            ${item.meetingDetails || ''}
          </div>
          <p style="margin-top:4px;">Seats: ${item.lastSeats}</p>
        </div>
        <div style="text-align:right;">
           <span class="status-badge status-${item.lastStatus}">${item.lastStatus}</span>
           <div style="margin-top: 6px;">
              <select class="notification-mode-select" data-id="${item.uniqueId}" style="width: 104px; font-size: 11px; padding: 2px;">
                  <option value="ALL" ${selAll}>🔔 All Alerts</option>
                  <option value="OPEN_ONLY" ${selOpen}>🟢 Open Only</option>
                  <option value="WAITLIST_ONLY" ${selWait}>🟠 Waitlist Only</option>
                  <option value="NONE" ${selNone}>🔕 Muted</option>
              </select>
              <div style="margin-top: 4px; text-align: right;">
                  <button class="btn-icon btn-delete" title="Remove" style="font-size: 14px; color: #999;">✕</button>
              </div>
           </div>
        </div>
      `;

      const select = div.querySelector('.notification-mode-select');
      select.addEventListener('change', (e) => {
        updateNotificationMode(item.uniqueId, e.target.value);
      });
      // Prevent click from bubbling to possible parent onclicks (if any)
      select.addEventListener('click', (e) => e.stopPropagation());

      div.querySelector('.btn-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        removeFromWatchlist(item.uniqueId);
      });

      container.appendChild(div);
    });
  });
}

function updateNotificationMode(uniqueId, newMode) {
  chrome.storage.local.get(['watchlist'], (result) => {
    const watchlist = result.watchlist || [];
    const itemIndex = watchlist.findIndex(i => i.uniqueId === uniqueId);

    if (itemIndex > -1) {
      watchlist[itemIndex].notificationMode = newMode;
      // Clean up old properties if they exist, to avoid confusion
      delete watchlist[itemIndex].isMuted;
      delete watchlist[itemIndex].isWaitlistMuted;

      chrome.storage.local.set({ watchlist }, loadWatchlist);
    }
  });
}

function removeFromWatchlist(uniqueId) {
  chrome.storage.local.get(['watchlist'], (result) => {
    const newList = (result.watchlist || []).filter(i => i.uniqueId !== uniqueId);
    chrome.storage.local.set({ watchlist: newList }, loadWatchlist);
  });
}