// Content script for email analysis
const webmailServices = {
  gmail: {
    isActive: () => window.location.hostname === 'mail.google.com',
    getEmailContent: extractGmailContent,
    initialize: initGmail
  },
  outlook: {
    isActive: () => window.location.hostname.includes('outlook'),
    getEmailContent: extractOutlookContent,
    initialize: initOutlook
  },
  yahoo: {
    isActive: () => window.location.hostname.includes('yahoo'),
    getEmailContent: extractYahooContent,
    initialize: initYahoo
  }
};

// Global variables
const currentTime = "2025-03-08 06:10:48";

// Check if API keys are configured before attempting analysis
function checkApiKeysConfigured() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "checkAPIKeys" }, (response) => {
      resolve(response?.geminiKeySet || false);
    });
  });
}

// Determine which email service we're on
let currentService = null;
for (const [name, service] of Object.entries(webmailServices)) {
  if (service.isActive()) {
    currentService = service;
    break;
  }
}

// Initialize if we found a supported service
if (currentService) {
  console.log("Email Guardian: Initializing extension");
  currentService.initialize();
}

// Gmail implementation
function initGmail() {
  // Track analyzed emails by ID
  const analyzedEmails = new Set();
  
  // Watch for email openings
  const observer = new MutationObserver(() => {
    // Get current email ID from URL if available
    const urlMatch = window.location.hash.match(/#inbox\/([^\/]+)/);
    const currentEmailId = urlMatch ? urlMatch[1] : null;
    
    if (currentEmailId && !analyzedEmails.has(currentEmailId)) {
      // Check if email content has been loaded
      const emailContent = document.querySelector('.a3s');
      if (emailContent) {
        analyzedEmails.add(currentEmailId);
        console.log(`Email Guardian: Found new email ${currentEmailId}`);
        setTimeout(() => analyzeCurrentEmail(), 1000); // Give a bit more time for content to fully load
      }
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Reset analyzed emails when navigating
  window.addEventListener('hashchange', () => {
    // Only keep track of recent emails to avoid memory issues
    if (analyzedEmails.size > 50) {
      analyzedEmails.clear();
    }
    
    // Remove any existing overlays when changing views
    removeOverlay();
  });
}

function extractGmailContent() {
  const emailContainer = document.querySelector('.a3s');
  if (!emailContainer) return null;
  
  // Try to get sender email, with fallback to display name
  let sender = "";
  const senderElement = document.querySelector('.gD');
  if (senderElement) {
    sender = senderElement.getAttribute('email') || senderElement.innerText;
  }
  
  // Get subject with fallback
  let subject = "";
  const subjectElement = document.querySelector('h2.hP');
  if (subjectElement) {
    subject = subjectElement.innerText;
  }
  
  // Get email body
  const emailContent = emailContainer.innerText;
  
  // Extract links
  const links = [];
  emailContainer.querySelectorAll('a').forEach(a => {
    if (a.href && a.href !== '#' && !a.href.startsWith('mailto:') && !links.includes(a.href)) {
      links.push(a.href);
    }
  });
  
  // Extract attachments (Gmail shows them as .aZo or .aQy elements)
  const attachments = [];
  document.querySelectorAll('.aZo, .aQy').forEach(attachment => {
    const nameElem = attachment.querySelector('.aV3');
    if (nameElem) {
      attachments.push({
        filename: nameElem.innerText.trim(),
        // We can't access actual file content due to browser security,
        // but we can note the attachment presence
        mimetype: detectMimeType(nameElem.innerText.trim())
      });
    }
  });
  
  return {
    sender,
    subject,
    body: emailContent,
    links,
    attachments
  };
}

// Outlook implementation 
function initOutlook() {
  // Track analyzed emails by ID
  const analyzedEmails = new Set();
  
  // Similar observer pattern
  const observer = new MutationObserver(() => {
    // Try to get email ID from URL or DOM
    const urlMatch = window.location.href.match(/\/([a-zA-Z0-9]+)$/);
    const currentEmailId = urlMatch ? urlMatch[1] : document.title;
    
    if (currentEmailId && !analyzedEmails.has(currentEmailId)) {
      // Check if we have an opened email
      if (document.querySelector('.ReadingPaneContent')) {
        analyzedEmails.add(currentEmailId);
        setTimeout(() => analyzeCurrentEmail(), 1000);
      }
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Reset tracking when navigating
  window.addEventListener('hashchange', () => {
    if (analyzedEmails.size > 50) {
      analyzedEmails.clear();
    }
    removeOverlay();
  });
}

function extractOutlookContent() {
  // Implementation specific to Outlook's DOM
  // Simplified implementation - extend based on Outlook's actual DOM structure
  const container = document.querySelector('.ReadingPaneContent');
  if (!container) return null;
  
  let sender = "";
  const senderElem = document.querySelector('.from');
  if (senderElem) {
    sender = senderElem.innerText;
  }
  
  let subject = "";
  const subjectElem = document.querySelector('.subject');
  if (subjectElem) {
    subject = subjectElem.innerText;
  }
  
  let body = "";
  const bodyElem = document.querySelector('.readingPaneBody');
  if (bodyElem) {
    body = bodyElem.innerText;
  }
  
  const links = [];
  if (bodyElem) {
    bodyElem.querySelectorAll('a').forEach(a => {
      if (a.href && a.href !== '#' && !a.href.startsWith('mailto:')) {
        links.push(a.href);
      }
    });
  }
  
  const attachments = [];
  document.querySelectorAll('.attachment').forEach(attachment => {
    const nameElem = attachment.querySelector('.attachmentName');
    if (nameElem) {
      attachments.push({
        filename: nameElem.innerText.trim(),
        mimetype: detectMimeType(nameElem.innerText.trim())
      });
    }
  });
  
  return {
    sender,
    subject,
    body,
    links,
    attachments
  };
}

// Yahoo Mail implementation
function initYahoo() {
  // Track analyzed emails
  const analyzedEmails = new Set();
  
  const observer = new MutationObserver(() => {
    // Check if we're viewing an email
    const emailView = document.querySelector('.message-view');
    if (emailView) {
      // Use subject as ID since Yahoo mail doesn't have clear email IDs
      const subjectElem = document.querySelector('.message-subject');
      if (subjectElem) {
        const emailId = subjectElem.innerText;
        if (emailId && !analyzedEmails.has(emailId)) {
          analyzedEmails.add(emailId);
          setTimeout(() => analyzeCurrentEmail(), 1000);
        }
      }
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function extractYahooContent() {
  // Implementation for Yahoo Mail's DOM structure
  const container = document.querySelector('.message-view');
  if (!container) return null;
  
  let sender = "";
  const senderElem = document.querySelector('.sender');
  if (senderElem) {
    sender = senderElem.innerText;
  }
  
  let subject = "";
  const subjectElem = document.querySelector('.message-subject');
  if (subjectElem) {
    subject = subjectElem.innerText;
  }
  
  let body = "";
  const bodyElem = document.querySelector('.message-body');
  if (bodyElem) {
    body = bodyElem.innerText;
  }
  
  const links = [];
  if (bodyElem) {
    bodyElem.querySelectorAll('a').forEach(a => {
      if (a.href && a.href !== '#' && !a.href.startsWith('mailto:')) {
        links.push(a.href);
      }
    });
  }
  
  const attachments = [];
  document.querySelectorAll('.attachment').forEach(attachment => {
    const nameElem = attachment.querySelector('.filename');
    if (nameElem) {
      attachments.push({
        filename: nameElem.innerText.trim(),
        mimetype: detectMimeType(nameElem.innerText.trim())
      });
    }
  });
  
  return {
    sender,
    subject,
    body,
    links,
    attachments
  };
}

// Helper functions
function detectMimeType(filename) {
  const extension = filename.split('.').pop().toLowerCase();
  
  const mimeTypes = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'txt': 'text/plain',
    'zip': 'application/zip',
    'exe': 'application/octet-stream'
  };
  
  return mimeTypes[extension] || 'application/octet-stream';
}

async function analyzeCurrentEmail() {
  if (!currentService) return;
  
  // Check if API keys are configured first
  const apiKeyConfigured = await checkApiKeysConfigured();
  if (!apiKeyConfigured) {
    // If no keys, direct user to set them up
    chrome.runtime.sendMessage({ type: "analyzeEmail", data: {} }, (response) => {
      showError(response.error || "Please configure your API keys in the extension settings");
    });
    return;
  }
  
  const emailData = currentService.getEmailContent();
  if (!emailData) return;
  
  // Inject loading indicator
  showLoadingOverlay();
  
  // Send to background script for analysis
  chrome.runtime.sendMessage({
    type: "analyzeEmail",
    data: emailData
  }, (response) => {
    hideLoadingOverlay();
    
    if (response.error) {
      showError(response.error);
    } else {
      displayResults(response, emailData);
    }
  });
}

// UI Functions
function showLoadingOverlay() {
  // Remove any existing overlay
  removeOverlay();
  
  const overlay = document.createElement('div');
  overlay.id = 'email-guardian-loading';
  overlay.classList.add('email-guardian-overlay');
  overlay.innerHTML = `
    <div class="email-guardian-popup">
      <div class="email-guardian-header">
        <h3>Email Guardian</h3>
        <button id="loading-close-btn" class="email-guardian-close-btn">×</button>
      </div>
      <div class="email-guardian-spinner"></div>
      <p>Analyzing email for threats...</p>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Add event listener to close button
  document.getElementById('loading-close-btn').addEventListener('click', function() {
    const loadingElement = document.getElementById('email-guardian-loading');
    if (loadingElement) loadingElement.remove();
  });
}

function hideLoadingOverlay() {
  removeOverlay();
}

function removeOverlay() {
  const loading = document.getElementById('email-guardian-loading');
  if (loading) loading.remove();
  
  const results = document.getElementById('email-guardian-results');
  if (results) results.remove();
}

function showError(message) {
  const overlay = document.createElement('div');
  overlay.id = 'email-guardian-results';
  overlay.classList.add('email-guardian-overlay');
  
  overlay.innerHTML = `
    <div class="email-guardian-popup email-guardian-error">
      <div class="email-guardian-header">
        <h3>Analysis Error</h3>
        <button id="error-close-btn" class="email-guardian-close-btn">×</button>
      </div>
      <p>${message}</p>
      <div class="email-guardian-buttons">
        <button class="email-guardian-button" id="error-close-button">Close</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Add event listeners to close buttons
  document.getElementById('error-close-btn').addEventListener('click', function() {
    const errorElement = document.getElementById('email-guardian-results');
    if (errorElement) errorElement.remove();
  });
  
  document.getElementById('error-close-button').addEventListener('click', function() {
    const errorElement = document.getElementById('email-guardian-results');
    if (errorElement) errorElement.remove();
  });
}

function displayResults(results, emailData) {
  const riskLevel = results.risk_level;
  const riskClass = riskLevel === 'Safe' ? 'safe' : 
                    riskLevel === 'Suspicious' ? 'suspicious' : 'dangerous';
  
  let linksHtml = '';
  if (emailData.links && emailData.links.length > 0) {
    linksHtml = `
      <h4>Links in this email:</h4>
      <ul class="email-guardian-links">
        ${emailData.links.slice(0, 5).map(link => `<li>${link}</li>`).join('')}
        ${emailData.links.length > 5 ? `<li>...and ${emailData.links.length - 5} more</li>` : ''}
      </ul>
    `;
  }
  
  let attachmentsHtml = '';
  if (emailData.attachments && emailData.attachments.length > 0) {
    attachmentsHtml = `
      <h4>Attachments:</h4>
      <ul class="email-guardian-attachments">
        ${emailData.attachments.map(a => `<li>${a.filename}</li>`).join('')}
      </ul>
    `;
  }
  
  let reasonsHtml = '';
  if (results.reasons && results.reasons.length > 0) {
    reasonsHtml = `
      <h4>Warning signs:</h4>
      <ul class="email-guardian-reasons">
        ${results.reasons.map(reason => `<li>${reason}</li>`).join('')}
      </ul>
    `;
  }
  
  // Optional VirusTotal results - only show if there are results
  let vtHtml = '';
  if (results.virustotal_results && results.virustotal_results.length > 0) {
    vtHtml = `
      <h4>VirusTotal Analysis:</h4>
      <ul class="email-guardian-vt">
        ${results.virustotal_results.map(vt => `<li>${vt}</li>`).join('')}
      </ul>
    `;
  }
  
  // Format the timestamp and user info
  const timestamp = results.timestamp || currentTime;
  const user = results.user || 'PixelCode01';
  
  const overlay = document.createElement('div');
  overlay.id = 'email-guardian-results';
  overlay.classList.add('email-guardian-overlay');
  
  overlay.innerHTML = `
    <div class="email-guardian-popup email-guardian-${riskClass}">
      <div class="email-guardian-header">
        <h3>Email Security Analysis</h3>
        <button id="email-guardian-close-btn" class="email-guardian-close-btn">×</button>
      </div>
      
      <div class="email-guardian-risk">
        <span class="email-guardian-risk-badge ${riskClass}">${riskLevel}</span>
        <span class="email-guardian-confidence">Confidence: ${results.confidence.toFixed(1)}%</span>
      </div>
      
      ${reasonsHtml}
      ${linksHtml}
      ${attachmentsHtml}
      ${vtHtml}
      
      <div class="email-guardian-action">
        <p><strong>Recommendation:</strong> ${results.recommended_action}</p>
      </div>
      
      <div class="email-guardian-footer">
        <span class="email-guardian-timestamp">Analysis: ${timestamp}</span>
        <span class="email-guardian-user">User: ${user}</span>
      </div>
      
      <div class="email-guardian-buttons">
        <button class="email-guardian-button" id="email-guardian-close-button">Close</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Add event listeners to close buttons AFTER adding to DOM
  document.getElementById('email-guardian-close-btn').addEventListener('click', function() {
    const resultElement = document.getElementById('email-guardian-results');
    if (resultElement) resultElement.remove();
  });
  
  document.getElementById('email-guardian-close-button').addEventListener('click', function() {
    const resultElement = document.getElementById('email-guardian-results');
    if (resultElement) resultElement.remove();
  });
}