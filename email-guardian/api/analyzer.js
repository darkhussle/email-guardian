/**
 * API Connector for Email Guardian
 * Handles communication with the PhishingShield API
 */
class PhishingAnalyzer {
  constructor(apiKey = null) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.yourphishingshield.com';  // Replace with actual API URL
  }
  
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }
  
  async analyzeEmail(emailData) {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(emailData)
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }
  
  async checkUrl(url) {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/check-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({ url })
      });
      