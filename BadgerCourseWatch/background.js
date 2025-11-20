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

  // Group by CourseID to avoid spamming API (if user watches 3 sections of same course)
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

      const sections = await response.json();

      // Check each watched item against the live API data
      for (const item of items) {
        // Find the matching section in the API response
        // We use sectionNumber (e.g. "001") as the stable identifier
        const liveSection = sections.find(s => s.sectionNumber === item.sectionNumber);

        if (liveSection) {
          const status = liveSection.packageEnrollmentStatus.status;
          const seats = liveSection.packageEnrollmentStatus.availableSeats;

          // Update storage with latest info
          item.lastStatus = status;
          item.lastSeats = seats;

          // LOGIC: If OPEN or Seats > 0, and it wasn't fully open before (or just always alert if open)
          // We alert if it is OPEN or has seats.
          if (status === "OPEN" || seats > 0) {
            sendNotification(item, seats);
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

function sendNotification(item, seats) {
  const title = `SEAT AVAILABLE: ${item.courseName}`;
  const message = `Section ${item.sectionNumber} has ${seats} seats open! Click to enroll.`;

  chrome.notifications.create(item.uniqueId, {
    type: 'basic',
    iconUrl: 'icon.png',
    title: title,
    message: message,
    priority: 2,
    requireInteraction: true // Keeps notification on screen until clicked
  });
}

// Handle Notification Click
chrome.notifications.onClicked.addListener((notificationId) => {
  // Open the enrollment site
  chrome.tabs.create({ url: "https://enroll.wisc.edu/course-search-enroll" });
  // Clear notification
  chrome.notifications.clear(notificationId);
});