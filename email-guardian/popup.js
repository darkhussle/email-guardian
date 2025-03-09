document.addEventListener('DOMContentLoaded', function() {
  const apiForm = document.getElementById('api-form');
  const geminiApiKeyInput = document.getElementById('gemini-api-key');
  const virusTotalApiKeyInput = document.getElementById('virustotal-api-key');
  
  // Load saved settings
  chrome.storage.local.get(['geminiApiKey', 'virusTotalApiKey', 'stats'], function(data) {
    if (data.geminiApiKey) {
      geminiApiKeyInput.value = data.geminiApiKey;
    }
    
    if (data.virusTotalApiKey) {
      virusTotalApiKeyInput.value = data.virusTotalApiKey;
    }
    
    // Update statistics
    if (data.stats) {
      document.getElementById('emails-analyzed').textContent = data.stats.emailsAnalyzed || 0;
      document.getElementById('threats-detected').textContent = data.stats.threatsDetected || 0;
      document.getElementById('links-scanned').textContent = data.stats.linksScanned || 0;
      document.getElementById('attachments-scanned').textContent = data.stats.attachmentsScanned || 0;
    }
  });
  
  // Save settings when form is submitted
  apiForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const geminiApiKey = geminiApiKeyInput.value.trim();
    const virusTotalApiKey = virusTotalApiKeyInput.value.trim();
    
    if (!geminiApiKey) {
      alert('Gemini API Key is required');
      return;
    }
    
    // Send keys to background script
    chrome.runtime.sendMessage({
      type: 'updateSettings',
      geminiApiKey: geminiApiKey,
      virusTotalApiKey: virusTotalApiKey
    }, function(response) {
      if (response.success) {
        // Show success message
        const button = apiForm.querySelector('button');
        const originalText = button.textContent;
        
        button.textContent = 'Saved!';
        button.style.backgroundColor = '#28a745';
        
        setTimeout(() => {
          button.textContent = originalText;
          button.style.backgroundColor = '';
        }, 2000);
      }
    });
  });
});