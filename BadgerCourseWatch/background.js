// 1. ON INSTALL: Open the Welcome Page
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      chrome.tabs.create({ url: "welcome.html" });
    }
  });
  
  // 2. Alarm Setup
  chrome.alarms.create("checkCourses", { periodInMinutes: 1.0 });
  
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "checkCourses") {
      checkEnrollment();
    }
  });
  
  // 3. Message Listener (Check Now OR Test Notification)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "CHECK_NOW") {
      checkEnrollment();
    }
    // NEW: Handle the Welcome Page Test
    if (request.action === "TEST_NOTIFICATION") {
      chrome.notifications.create("test-alert-" + Date.now(), {
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Success! Notifications are Working',
        message: 'You are all set to watch for open seats.',
        priority: 2,
        requireInteraction: true
      });
    }
  });
  
  async function checkEnrollment() {
    const data = await chrome.storage.local.get(['watchlist']);
    const watchlist = data.watchlist || [];
  
    if (watchlist.length === 0) return;
  
    const uniqueRequests = {};
    watchlist.forEach(item => {
      const key = `${item.termCode}/${item.subjectCode}/${item.courseId}`;
      if (!uniqueRequests[key]) uniqueRequests[key] = [];
      uniqueRequests[key].push(item);
    });
  
    for (const [apiPath, items] of Object.entries(uniqueRequests)) {
      try {
        const response = await fetch(`https://enroll.wisc.edu/api/search/v1/enrollmentPackages/${apiPath}`);
        
        // --- NEW: LOGIN ERROR DETECTION ---
        // 1. Check for Explicit 401/403 (Unauthorized)
        if (response.status === 401 || response.status === 403) {
          sendLoginAlert();
          return; // Stop checking, we are logged out
        }

        // 2. Check for Implicit Redirects (API returns HTML login page instead of JSON)
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") === -1) {
          sendLoginAlert();
          return; 
        }
        // ----------------------------------

        if (!response.ok) continue; // Skip generic server errors (500)
  
        const packages = await response.json();
  
        for (const item of items) {
            // --- NEW: MUTE CHECK ---
            if (item.isMuted) {
                continue; // Skip this item completely
            }
            // -----------------------

            // A. Find the correct Package (Enrollment Option)
            // Use '==' for loose type matching (string vs number)
            const livePkg = packages.find(p => p.enrollmentClassNumber == item.enrollmentClassNumber);
  
          if (livePkg) {
            let liveSection = livePkg.sections.find(s => s.classUniqueId.classNumber == item.enrollmentClassNumber);
            
            if (!liveSection && livePkg.sections.length > 0) {
               liveSection = livePkg.sections[0];
            }
  
            if (liveSection) {
              const enrollment = liveSection.enrollmentStatus;
              const seats = enrollment.openSeats;
              const waitlistOpen = enrollment.openWaitlistSpots;
  
              let status = "CLOSED";
              if (seats > 0) {
                status = "OPEN";
              } else if (waitlistOpen > 0) {
                status = "WAITLISTED";
              }
  
              item.lastStatus = status;
              item.lastSeats = seats;
  
              if (status === "OPEN" || status === "WAITLISTED") {
                sendNotification(item, seats, waitlistOpen, status);
              }
            }
          }
        }
      } catch (e) {
        console.error("Fetch failed for " + apiPath, e);
      }
    }
  
    chrome.storage.local.set({ watchlist });
  }
  
  // --- NEW: SPECIFIC LOGIN ALERT ---
  function sendLoginAlert() {
    chrome.notifications.create("login-alert", {
      type: 'basic',
      iconUrl: 'icon.png',
      title: '⚠️ Session Expired',
      message: 'Please log in to enroll.wisc.edu to keep watching courses.',
      priority: 2,
      requireInteraction: true
    });
  }
  
  function sendNotification(item, seats, waitlistOpen, status) {
    let title = `OPEN!!: ${item.courseName}`;
    let message = `${item.courseName} - ${item.sectionType || 'Section'} ${item.sectionNumber} has ${seats} seats open!`;
  
    if (status === "WAITLISTED") {
      title = `WAITLIST!!: ${item.courseName}`;
      message = `${item.courseName} - ${item.sectionType || 'Section'} ${item.sectionNumber} has ${waitlistOpen} waitlist spots!`;
    }
  
    // Create a unique ID so every alert shows up, even if multiple happen at once
    const notificationId = `${item.uniqueId}-${Date.now()}`;
  
    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: 'icon.png',
      title: title,
      message: message,
      
      // --- IMPORTANT SETTINGS ---
      priority: 2,              // 2 = High Priority (Top of list)
      requireInteraction: true, // true = Sticks on screen until you click it
      silent: false             // false = Play default system sound
      // --------------------------
    });
  }
  
  chrome.notifications.onClicked.addListener((notificationId) => {
    // Handle login alert differently
    if (notificationId === "login-alert") {
      chrome.tabs.create({ url: "https://enroll.wisc.edu" });
    } else {
      chrome.tabs.create({ url: "https://enroll.wisc.edu/course-search-enroll" });
    }
    chrome.notifications.clear(notificationId);
  });