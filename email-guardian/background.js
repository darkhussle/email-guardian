// Background Service Worker
let geminiApiKey = "";
let virusTotalApiKey = "";
let currentUser = "PixelCode01";
let currentTime = "2025-03-08 06:04:40";
let isExtensionReady = false;
let pendingRequests = [];

// Initialize settings when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  initializeExtension();
});

// Also initialize on service worker startup
initializeExtension();

function initializeExtension() {
  chrome.storage.local.get(["geminiApiKey", "virusTotalApiKey", "stats"], (result) => {
    if (result.geminiApiKey) geminiApiKey = result.geminiApiKey;
    if (result.virusTotalApiKey) virusTotalApiKey = result.virusTotalApiKey;
    
    // Initialize stats if they don't exist
    if (!result.stats) {
      chrome.storage.local.set({
        stats: {
          emailsAnalyzed: 0,
          threatsDetected: 0,
          linksScanned: 0,
          attachmentsScanned: 0
        }
      });
    }
    
    isExtensionReady = true;
    console.log("Email Guardian: Extension initialized with API key:", geminiApiKey ? "Present" : "Missing");
    
    // Process any pending requests
    while (pendingRequests.length > 0) {
      const request = pendingRequests.shift();
      handleMessage(request.message, request.sender, request.sendResponse);
    }
  });
}

// Handle messages with proper queuing
function handleMessage(message, sender, sendResponse) {
  if (message.type === "analyzeEmail") {
    if (!isExtensionReady) {
      // Queue the request if extension is not ready
      pendingRequests.push({ message, sender, sendResponse });
      return true;
    }
    
    if (!geminiApiKey) {
      sendResponse({
        error: "API key not configured. Please set your API key in the extension settings.",
        risk_level: "Suspicious",
        confidence: 50,
        reasons: ["Missing API key configuration"],
        recommended_action: "Configure the extension with your API keys"
      });
      return true;
    }
    
    analyzeEmail(message.data)
      .then(result => {
        // Update stats
        chrome.storage.local.get(["stats"], (data) => {
          const stats = data.stats || {
            emailsAnalyzed: 0,
            threatsDetected: 0,
            linksScanned: 0,
            attachmentsScanned: 0
          };
          
          stats.emailsAnalyzed += 1;
          
          if (result.risk_level === "Dangerous" || result.risk_level === "Suspicious") {
            stats.threatsDetected += 1;
          }
          
          if (message.data.links) {
            stats.linksScanned += message.data.links.length;
          }
          
          if (message.data.attachments) {
            stats.attachmentsScanned += message.data.attachments.length;
          }
          
          chrome.storage.local.set({ stats });
        });
        
        sendResponse(result);
      })
      .catch(error => sendResponse({ 
        error: error.message,
        risk_level: "Suspicious",
        confidence: 50,
        reasons: ["Analysis error: " + error.message],
        recommended_action: "Please review this email carefully"
      }));
    return true; // Required for async response
  }
  
  if (message.type === "updateSettings") {
    geminiApiKey = message.geminiApiKey || geminiApiKey;
    virusTotalApiKey = message.virusTotalApiKey || virusTotalApiKey;
    
    chrome.storage.local.set({
      geminiApiKey: message.geminiApiKey,
      virusTotalApiKey: message.virusTotalApiKey
    });
    
    sendResponse({ success: true });
  }
  
  if (message.type === "getStats") {
    chrome.storage.local.get(["stats"], (data) => {
      sendResponse({ stats: data.stats || {} });
    });
    return true;
  }
  
  if (message.type === "checkAPIKeys") {
    sendResponse({
      geminiKeySet: !!geminiApiKey,
      virusTotalKeySet: !!virusTotalApiKey
    });
    return true;
  }
}

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  return handleMessage(message, sender, sendResponse);
});

// Direct API integration: analyze email
async function analyzeEmail(emailData) {
  try {
    if (!geminiApiKey) {
      return { error: "Gemini API key not configured. Please set your API key in the extension settings." };
    }
    
    // Format email for analysis
    const emailText = `From: ${emailData.sender}\nSubject: ${emailData.subject}\n\n${emailData.body}`;
    
    // Format attachments if present
    let attachmentText = "";
    if (emailData.attachments && emailData.attachments.length > 0) {
      attachmentText = "\nAttachments:\n- " + 
        emailData.attachments.map(a => `${a.filename} (${a.mimetype || "unknown type"})`).join("\n- ");
    }
    
    // Check for safe domain patterns first - whitelisting approach
    if (
      // Government domains and educational institutions
      (emailData.sender.toLowerCase().includes('@nic.in') || 
       emailData.sender.toLowerCase().includes('@gov.in') ||
       emailData.sender.toLowerCase().includes('@edu') ||
       emailData.sender.toLowerCase().includes('.ac.in')) &&
      // Common safe notifications
      (emailData.subject.toLowerCase().includes('application') ||
       emailData.subject.toLowerCase().includes('confirmation') ||
       emailData.subject.toLowerCase().includes('admission'))
    ) {
      // Return safe for educational/government emails with confirmation subjects
      return {
        timestamp: currentTime,
        user: currentUser,
        risk_level: "Safe",
        confidence: 90,
        reasons: ["Email from verified educational/government domain"],
        recommended_action: "No action needed. This appears to be a legitimate notification email.",
        analysis: "This is an automated notification from a verified educational or government organization."
      };
    }
    
    // Call Gemini API directly with improved context
    const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analyze this email for phishing threats and security risks. Be cautious about false positives.
                  
                  EMAIL:
                  ${emailText}
                  ${attachmentText}
                  
                  Look for these SPECIFIC phishing indicators:
                  - Urgency combined with threatening consequences
                  - Obvious spelling/grammar errors throughout the email
                  - Direct requests for sensitive financial data or passwords
                  - Links to suspicious domains that don't match the claimed sender
                  - Impersonation of well-known brands with incorrect domains
                  - Suspicious executable attachments
                  
                  DO NOT flag as phishing:
                  - Automated confirmation emails from legitimate institutions
                  - Educational communications from .edu or .ac.in domains
                  - Government notices from .gov or .nic.in domains
                  - Auto-generated application or registration confirmations
                  - Presence of application IDs, reference numbers
                  
                  IMPORTANT: Respond with ONLY a JSON object having this structure:
                  {
                    "phishing_likelihood": <float 0-1>,
                    "confidence": <float 0-1>,
                    "insights": [<strings listing specific red flags, if any>],
                    "reasoning": "<detailed explanation>",
                    "recommended_action": "<action advice>"
                  }`
          }]
        }]
      })
    });
    
    if (!geminiResponse.ok) {
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }
    
    const geminiData = await geminiResponse.json();
    const textContent = geminiData.candidates[0].content.parts[0].text;
    
    // Extract JSON from response
    const jsonMatch = textContent.match(/({[\s\S]*})/);
    let analysis = {
      phishing_likelihood: 0.2, // Lower default value to reduce false positives
      confidence: 0.5,
      insights: [],
      reasoning: "Standard email analysis complete",
      recommended_action: "No specific concerns detected"
    };
    
    if (jsonMatch) {
      try {
        const parsedAnalysis = JSON.parse(jsonMatch[1]);
        analysis = {
          ...analysis,
          ...parsedAnalysis
        };
      } catch (e) {
        console.error("Error parsing AI response:", e);
      }
    }
    
    // Process links with VirusTotal if API key is available
    let vtResults = [];
    if (virusTotalApiKey && emailData.links && emailData.links.length > 0) {
      vtResults = await checkLinksWithVirusTotal(emailData.links);
    }
    
    // Calculate risk level with adjusted sensitivity
    const riskLevel = calculateRiskLevel(analysis, vtResults, emailData);
    
    return {
      timestamp: currentTime,
      user: currentUser,
      risk_level: riskLevel,
      confidence: (analysis.confidence || 0.5) * 100,
      reasons: analysis.insights || [],
      recommended_action: analysis.recommended_action || "Email appears to be legitimate.",
      analysis: analysis.reasoning || "",
      virustotal_results: vtResults.filter(result => !result.includes("Error"))
    };
  } catch (error) {
    console.error("Analysis failed:", error);
    
    return { 
      timestamp: currentTime,
      user: currentUser,
      risk_level: "Suspicious",
      confidence: 50,
      reasons: ["Technical error encountered during analysis"],
      recommended_action: "Exercise caution with this email",
      analysis: "Analysis failed due to technical issues: " + error.message
    };
  }
}

// Helper function to check links with VirusTotal
async function checkLinksWithVirusTotal(links) {
  const results = [];
  
  if (!virusTotalApiKey) {
    return results;
  }
  
  for (const link of links.slice(0, 5)) { // Limit to 5 links to avoid rate limiting
    try {
      // Skip known safe domains
      if (
        link.includes('nic.in') || 
        link.includes('gov.in') || 
        link.includes('nta.ac.in')
      ) {
        continue;
      }
      
      // Validate URL before sending
      let url = link;
      try {
        // Try to create a URL object to verify link is valid
        new URL(url);
      } catch (e) {
        // If URL is invalid, try adding http:// prefix
        if (!url.startsWith('http')) {
          url = 'http://' + url;
          try {
            new URL(url); // Verify again with prefix
          } catch (e) {
            continue; // Skip if still invalid
          }
        } else {
          continue; // Skip invalid URLs
        }
      }
      
      const response = await fetch("https://www.virustotal.com/api/v3/urls", {
        method: "POST",
        headers: {
          "x-apikey": virusTotalApiKey,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: `url=${encodeURIComponent(url)}`
      });
      
      if (!response.ok) {
        continue; // Skip errors silently
      }
      
      const data = await response.json();
      const id = data?.data?.id;
      
      if (id) {
        // Wait briefly then check analysis
        await new Promise(r => setTimeout(r, 2500));
        
        const analysisResponse = await fetch(`https://www.virustotal.com/api/v3/analyses/${id}`, {
          headers: {
            "x-apikey": virusTotalApiKey
          }
        });
        
        if (!analysisResponse.ok) {
          continue; // Skip errors silently
        }
        
        const analysisData = await analysisResponse.json();
        const stats = analysisData?.data?.attributes?.stats || {};
        const total = Object.values(stats).reduce((sum, val) => sum + val, 0);
        
        if (stats.malicious > 0) {
          let domain;
          try {
            domain = new URL(url).hostname;
          } catch (e) {
            domain = url;
          }
          results.push(`URL: ${domain} - DANGEROUS - ${stats.malicious}/${total} security vendors flagged as malicious`);
        } else if (stats.suspicious > 0) {
          let domain;
          try {
            domain = new URL(url).hostname;
          } catch (e) {
            domain = url;
          }
          results.push(`URL: ${domain} - SUSPICIOUS - ${stats.suspicious}/${total} security vendors flagged as suspicious`);
        }
      }
    } catch (e) {
      // Silently ignore errors
      console.error(`Error scanning URL: ${link}`, e);
    }
  }
  
  return results;
}

function calculateRiskLevel(analysis, vtResults, emailData) {
  let score = analysis.phishing_likelihood || 0.2;
  
  // Check for safe domains and reduce risk for them
  if (
    emailData.sender.toLowerCase().includes('@nic.in') || 
    emailData.sender.toLowerCase().includes('@gov.in') || 
    emailData.sender.toLowerCase().includes('@edu') ||
    emailData.sender.toLowerCase().includes('.ac.in') ||
    // Add more trusted domains as needed
    emailData.sender.toLowerCase().includes('@jeemain') ||
    emailData.sender.toLowerCase().includes('@nta')
  ) {
    // Drastically reduce the risk for educational/government emails
    score = Math.max(0.1, score - 0.3);
  }
  
  // Check for examination/application related subjects
  const safeSubjectPatterns = [
    'application', 'admission', 'exam', 'result', 'confirmation',
    'jee', 'neet', 'nta', 'test', 'score'
  ];
  
  for (const pattern of safeSubjectPatterns) {
    if (emailData.subject.toLowerCase().includes(pattern)) {
      score = Math.max(0.1, score - 0.1);
      break;
    }
  }
  
  // Check for auto-generated email markers
  if (
    emailData.body.toLowerCase().includes('auto generated') ||
    emailData.body.toLowerCase().includes('do not reply') ||
    emailData.body.toLowerCase().includes('noreply') ||
    emailData.body.toLowerCase().includes('this is an automated')
  ) {
    score = Math.max(0.1, score - 0.1);
  }
  
  // Increase score if VirusTotal found issues
  if (vtResults.length > 0) {
    const dangerousCount = vtResults.filter(r => r.includes("DANGEROUS")).length;
    const suspiciousCount = vtResults.filter(r => r.includes("SUSPICIOUS")).length;
    
    score += (dangerousCount * 0.2) + (suspiciousCount * 0.1);
  }
  
  score = Math.min(score, 1.0);
  score = Math.max(score, 0.0);
  
  if (score < 0.3) return "Safe";
  if (score < 0.6) return "Suspicious";
  return "Dangerous";
}