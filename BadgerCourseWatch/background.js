// Check every 1.0 minutes
chrome.alarms.create("checkCourses", { periodInMinutes: 1.0 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkCourses") {
    checkEnrollment();
  }
});

async function checkEnrollment() {
  const data = await chrome.storage.local.get(['watchlist']);
  const watchlist = data.watchlist || [];

  if (watchlist.length === 0) return;

  // Group by CourseID to avoid spamming API
  const uniqueRequests = {};
  watchlist.forEach(item => {
    const key = `${item.termCode}/${item.subjectCode}/${item.courseId}`;
    if (!uniqueRequests[key]) uniqueRequests[key] = [];
    uniqueRequests[key].push(item);
  });

  // Perform checks
  for (const [apiPath, items] of Object.entries(uniqueRequests)) {
    try {
      const response = await fetch(`https://enroll.wisc.edu/api/search/v1/enrollmentPackages/${apiPath}`);
      if (!response.ok) continue;

      const packages = await response.json();

      // Check each watched item against the live API data
      for (const item of items) {
        // 1. Find the matching Package
        const livePkg = packages.find(p => p.enrollmentClassNumber === item.enrollmentClassNumber);

        if (livePkg) {
          // 2. Find the matching Section inside that package
          let liveSection = livePkg.sections.find(s => s.classUniqueId.classNumber === item.enrollmentClassNumber);
          
          // Fallback
          if (!liveSection && livePkg.sections.length > 0) {
             liveSection = livePkg.sections[0];
          }

          if (liveSection) {
            const enrollment = liveSection.enrollmentStatus;
            const seats = enrollment.openSeats;
            const waitlistOpen = enrollment.openWaitlistSpots;

            // Derive Status
            let status = "CLOSED";
            if (seats > 0) {
              status = "OPEN";
            } else if (waitlistOpen > 0) {
              status = "WAITLISTED";
            }

            // Check if status changed or if we should alert
            const previousStatus = item.lastStatus;
            
            // Update storage
            item.lastStatus = status;
            item.lastSeats = seats;

            // --- ALERT LOGIC ---
            // Trigger if OPEN or WAITLISTED
            if (status === "OPEN" || status === "WAITLISTED") {
              // Optional: You can add a check here to only alert if it wasn't already known
              // e.g., if (status !== previousStatus) ... 
              // For now, we alert every check if it's available, which ensures you don't miss it.
              sendNotification(item, seats, waitlistOpen, status);
            }
          }
        }
      }
    } catch (e) {
      console.error("Fetch failed for " + apiPath, e);
    }
  }

  // Save updated statuses back to storage
  chrome.storage.local.set({ watchlist });
}

function sendNotification(item, seats, waitlistOpen, status) {
  let title = `SEAT AVAILABLE: ${item.courseName}`;
  let message = `${item.sectionType || 'Section'} ${item.sectionNumber} has ${seats} seats open!`;

  if (status === "WAITLISTED") {
    title = `WAITLIST OPEN: ${item.courseName}`;
    message = `${item.sectionType || 'Section'} ${item.sectionNumber} has ${waitlistOpen} waitlist spots!`;
  }

  chrome.notifications.create(item.uniqueId, {
    type: 'basic',
    iconUrl: 'icon.png',
    title: title,
    message: message,
    priority: 2,
    requireInteraction: true 
  });
}

// Handle Notification Click
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.tabs.create({ url: "https://enroll.wisc.edu/course-search-enroll" });
  chrome.notifications.clear(notificationId);
});