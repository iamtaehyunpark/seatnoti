# BadgerSeatWatch - Investigation Report

## Project Overview
Chrome Extension (Manifest V3) that monitors UW-Madison course seat availability by polling internal APIs every 60 seconds.

## ✅ Implementation Status

### File Structure
All required files are present:
- ✅ `manifest.json` - Correctly configured with all permissions
- ✅ `popup.html` - UI structure with tabs implemented
- ✅ `popup.js` - Search and watchlist management logic
- ✅ `background.js` - Background monitoring service worker
- ✅ `dictionaries.js` - Terms and subjects data
- ✅ `styles.css` - Styling complete
- ✅ `icon.png` - Referenced in manifest

### Core Features Implemented
1. ✅ **Course Search** - POST to `/api/search/v1` working
2. ✅ **Section Loading** - GET to `/enrollmentPackages/{term}/{subject}/{courseId}` working
3. ✅ **Watchlist Management** - Add/remove sections, max 10 limit enforced
4. ✅ **Background Monitoring** - 60-second alarm system active
5. ✅ **Notifications** - Basic notification system functional
6. ✅ **Data Storage** - Using `chrome.storage.local` correctly

## ⚠️ Issues Found

### 1. **CRITICAL: Notification Spam Bug**
**Location:** `background.js` lines 42-50

**Problem:** The code updates `item.lastStatus` BEFORE checking if it changed, causing notifications to fire on EVERY check when a course is open, not just when it transitions from closed to open.

**Current Code:**
```javascript
// Update storage with latest info
item.lastStatus = status;
item.lastSeats = seats;

// LOGIC: If OPEN or Seats > 0, and it wasn't fully open before (or just always alert if open)
// We alert if it is OPEN or has seats.
if (status === "OPEN" || seats > 0) {
    sendNotification(item, seats);
}
```

**Expected Behavior:** Only notify when status CHANGES from non-open to open.

**Fix Required:** Check the OLD status before updating:
```javascript
const oldStatus = item.lastStatus;
const oldSeats = item.lastSeats || 0;

// Update storage with latest info
item.lastStatus = status;
item.lastSeats = seats;

// Only alert if it JUST became open (wasn't open before)
if ((status === "OPEN" || seats > 0) && (oldStatus !== "OPEN" && oldSeats === 0)) {
    sendNotification(item, seats);
}
```

### 2. **Missing: Badge Update Feature**
**Location:** `background.js` - Not implemented

**Problem:** The architecture plan specifies updating the extension icon badge (e.g., showing "!" or "1") when seats are available, but this is not implemented.

**Fix Required:** Add badge update logic:
```javascript
// Count open courses
const openCount = watchlist.filter(item => 
    item.lastStatus === "OPEN" || (item.lastSeats > 0)
).length;

if (openCount > 0) {
    chrome.action.setBadgeText({ text: openCount.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#c5050c' });
} else {
    chrome.action.setBadgeText({ text: '' });
}
```

### 3. **Minor: uniqueId Format Inconsistency**
**Location:** `popup.js` line 194

**Problem:** The `uniqueId` is constructed as `termCode-courseId-sectionNumber`, but the plan specifies `termCode-subjectCode-courseId-sectionNumber`. While this may work in practice, it could theoretically cause collisions if different subjects have the same courseId.

**Current:**
```javascript
const uniqueId = `${currentSelectedCourse.termCode}-${currentSelectedCourse.courseId}-${sectionNum}`;
```

**Recommended:**
```javascript
const uniqueId = `${currentSelectedCourse.termCode}-${currentSelectedCourse.subjectCode}-${currentSelectedCourse.courseId}-${sectionNum}`;
```

### 4. **Minor: Credentials Flag**
**Location:** `popup.js` lines 91, 142

**Problem:** The architecture plan mentions using `includeCredentials: true` for API calls, but the fetch calls don't explicitly set this. However, Chrome extensions automatically send cookies for same-origin requests, so this may not be an issue.

**Note:** If CORS issues occur, explicitly add:
```javascript
credentials: 'include'
```

## 📊 Code Quality Assessment

### Strengths
- ✅ Clean separation of concerns
- ✅ Good use of ES6 modules
- ✅ Proper error handling in search
- ✅ Efficient API grouping (multiple sections of same course = one API call)
- ✅ User-friendly UI with tabs
- ✅ Proper storage management

### Areas for Improvement
- ⚠️ Missing change detection in notifications (critical bug)
- ⚠️ No badge updates for visual feedback
- ⚠️ Could add more error handling in background.js
- ⚠️ No retry logic for failed API calls
- ⚠️ No user feedback when API calls fail silently

## 🔧 Recommended Fixes Priority

1. **HIGH:** Fix notification spam bug (Issue #1)
2. **MEDIUM:** Add badge update feature (Issue #2)
3. **LOW:** Fix uniqueId format (Issue #3)
4. **LOW:** Add explicit credentials flag if needed (Issue #4)

## 📝 Additional Observations

1. **Alarm Creation:** The alarm is created on every service worker startup. Consider checking if it already exists first.
2. **Notification Persistence:** Notifications use `requireInteraction: true`, which is good for ensuring users see them.
3. **Storage Updates:** The watchlist is saved after all checks complete, which is efficient.
4. **Section Matching:** Uses `sectionNumber` for matching, which should be stable.

## ✅ Conclusion

The extension is **~90% complete** and follows the architecture plan well. The main critical issue is the notification spam bug that needs immediate attention. The missing badge feature would enhance user experience but is not critical for functionality.

