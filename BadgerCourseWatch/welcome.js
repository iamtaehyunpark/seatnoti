document.getElementById('btn-test').addEventListener('click', () => {
    // Send message to background script to trigger a fake alert
    chrome.runtime.sendMessage({ action: "TEST_NOTIFICATION" });
    
    document.getElementById('status').textContent = "Notification sent! If you didn't see it, check your OS settings.";
    document.getElementById('status').style.color = "red";
});