import { TERMS, SUBJECTS } from './dictionaries.js';

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  populateDropdowns();
  loadWatchlist();
  setupTabs();
  setupSearch();
});

// --- DOM Elements ---
const views = { watch: document.getElementById('view-watch'), search: document.getElementById('view-search') };
const tabs = { watch: document.getElementById('tab-watch'), search: document.getElementById('tab-search') };
const searchResultsDiv = document.getElementById('search-results');
const sectionResultsDiv = document.getElementById('section-results');
const sectionListDiv = document.getElementById('section-list');
let currentSelectedCourse = null; // Stores data about the course currently being inspected

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

function switchView(viewName) {
  views.watch.classList.toggle('hidden', viewName !== 'watch');
  views.watch.classList.toggle('active', viewName === 'watch');
  views.search.classList.toggle('hidden', viewName !== 'search');
  views.search.classList.toggle('active', viewName === 'search');
  
  tabs.watch.classList.toggle('active', viewName === 'watch');
  tabs.search.classList.toggle('active', viewName === 'search');

  if (viewName === 'watch') loadWatchlist();
}

// --- Search Logic ---
function setupSearch() {
  document.getElementById('btn-search').addEventListener('click', performSearch);
  document.getElementById('btn-back').addEventListener('click', () => {
    sectionResultsDiv.classList.add('hidden');
    searchResultsDiv.classList.remove('hidden');
  });
  document.getElementById('btn-add-watch').addEventListener('click', addToWatchlist);
}

async function performSearch() {
  const term = document.getElementById('search-term').value;
  const subject = document.getElementById('search-subject').value;
  const keyword = document.getElementById('search-keyword').value;
  const statusMsg = document.getElementById('status-msg');

  if (!keyword) {
    statusMsg.textContent = "Please enter a keyword.";
    return;
  }

  statusMsg.textContent = "Searching...";
  searchResultsDiv.innerHTML = '';
  sectionResultsDiv.classList.add('hidden');

  try {
    const payload = {
      selectedTerm: term,
      queryString: keyword,
      filters: [{ term: { "subject.subjectCode": subject } }],
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
  }
}

function renderSearchResults(hits) {
  searchResultsDiv.classList.remove('hidden');
  hits.forEach(hit => {
    const div = document.createElement('div');
    div.className = 'course-item';
    div.innerHTML = `
      <strong>${hit.subject.shortDescription} ${hit.catalogNumber}</strong><br>
      ${hit.title}
    `;
    div.addEventListener('click', () => loadSections(hit));
    searchResultsDiv.appendChild(div);
  });
}

async function loadSections(courseHit) {
  const statusMsg = document.getElementById('status-msg');
  statusMsg.textContent = "Loading sections...";
  
  // Save current context
  currentSelectedCourse = {
    termCode: courseHit.termCode,
    subjectCode: courseHit.subject.subjectCode,
    courseId: courseHit.courseId,
    courseName: `${courseHit.subject.shortDescription} ${courseHit.catalogNumber}`
  };

  try {
    const url = `https://enroll.wisc.edu/api/search/v1/enrollmentPackages/${currentSelectedCourse.termCode}/${currentSelectedCourse.subjectCode}/${currentSelectedCourse.courseId}`;
    const response = await fetch(url);
    const sections = await response.json();

    statusMsg.textContent = "";
    renderSections(sections);

  } catch (err) {
    statusMsg.textContent = "Error loading sections.";
  }
}

function renderSections(sections) {
  searchResultsDiv.classList.add('hidden');
  sectionResultsDiv.classList.remove('hidden');
  sectionListDiv.innerHTML = '';

  sections.forEach(sec => {
    const row = document.createElement('div');
    row.className = 'section-row';
    
    const status = sec.packageEnrollmentStatus.status;
    const seats = sec.packageEnrollmentStatus.availableSeats;
    
    row.innerHTML = `
      <label>
        <input type="checkbox" value="${sec.enrollmentClassNumber}" data-section="${sec.sectionNumber}" data-status="${status}" data-seats="${seats}">
        <div class="section-details">
          <strong>Section ${sec.sectionNumber}</strong> (${sec.type})<br>
          Status: ${status} (${seats} open)
        </div>
      </label>
    `;
    sectionListDiv.appendChild(row);
  });
}

// --- Watchlist Logic ---
function addToWatchlist() {
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
      const uniqueId = `${currentSelectedCourse.termCode}-${currentSelectedCourse.courseId}-${sectionNum}`;

      // Deduplicate
      if (!watchlist.find(item => item.uniqueId === uniqueId)) {
        watchlist.push({
          uniqueId: uniqueId,
          termCode: currentSelectedCourse.termCode,
          subjectCode: currentSelectedCourse.subjectCode,
          courseId: currentSelectedCourse.courseId,
          courseName: currentSelectedCourse.courseName,
          sectionNumber: sectionNum,
          lastStatus: cb.getAttribute('data-status'),
          lastSeats: cb.getAttribute('data-seats'),
          enrollmentClassNumber: cb.value // Critical for matching later
        });
        addedCount++;
      }
    });

    chrome.storage.local.set({ watchlist }, () => {
      document.getElementById('status-msg').textContent = `Added ${addedCount} sections.`;
      switchView('watch');
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
      const div = document.createElement('div');
      div.className = 'watch-item';
      div.innerHTML = `
        <div class="watch-info">
          <h4>${item.courseName} - Sec ${item.sectionNumber}</h4>
          <p>Seats: ${item.lastSeats}</p>
        </div>
        <div style="text-align:right;">
           <span class="status-badge status-${item.lastStatus}">${item.lastStatus}</span>
           <button class="btn-delete">✕</button>
        </div>
      `;
      
      // Delete Button Logic
      div.querySelector('.btn-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        removeFromWatchlist(item.uniqueId);
      });

      container.appendChild(div);
    });
  });
}

function removeFromWatchlist(uniqueId) {
  chrome.storage.local.get(['watchlist'], (result) => {
    const newList = (result.watchlist || []).filter(i => i.uniqueId !== uniqueId);
    chrome.storage.local.set({ watchlist: newList }, loadWatchlist);
  });
}