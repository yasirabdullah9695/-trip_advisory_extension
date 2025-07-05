(function () {
  // Global variables for authentication
  let currentUser = null;
  let currentOTP = null;

  // Check if user is already logged in
  chrome.storage.local.get(['currentUser'], (result) => {
    if (result.currentUser) {
      currentUser = result.currentUser;
      initializeContentScript();
    } else {
      // Show authentication UI
      createAuthUI();
    }
  });

  // Function to create authentication UI
  function createAuthUI() {
    const authContainer = document.createElement('div');
    authContainer.id = 'ta-auth-container';
    Object.assign(authContainer.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: '10000',
      backgroundColor: '#ffffff',
      padding: '20px',
      borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
      width: '300px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif'
    });

    // Add CSS styles
    const style = document.createElement('style');
    style.textContent = `
      .ta-form-group {
        margin-bottom: 12px;
      }
      .ta-form-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
      }
      .ta-form-group input {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-sizing: border-box;
      }
      .ta-button {
        margin: 8px 0;
        padding: 10px;
        background: #1976d2;
        color: white;
        border: none;
        width: 100%;
        border-radius: 6px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.3s ease;
      }
      .ta-button:hover {
        background: #125ca1;
      }
      .ta-toggle-form {
        text-align: center;
        margin-top: 10px;
        font-size: 0.9rem;
      }
      .ta-toggle-form a {
        color: #1976d2;
        cursor: pointer;
        text-decoration: underline;
      }
      .ta-otp-container {
        display: none;
        margin-top: 10px;
      }
      .ta-error-message {
        color: #e74c3c;
        font-size: 0.9rem;
        margin-top: 5px;
      }
      .ta-success-message {
        color: #27ae60;
        font-size: 0.9rem;
        margin-top: 5px;
      }
    `;
    document.head.appendChild(style);

    // Create login form
    const loginForm = document.createElement('div');
    loginForm.id = 'ta-login-form';
    loginForm.innerHTML = `
      <h3 style="margin-top: 0; font-size: 1.2rem; text-align: center; color: #1976d2;">TripAdvisor Reviews</h3>
      <div class="ta-form-group">
        <label for="ta-login-email">Email:</label>
        <input type="email" id="ta-login-email" placeholder="Enter your email">
      </div>
      <button id="ta-login-btn" class="ta-button">Login</button>
      <div id="ta-login-error" class="ta-error-message"></div>
      <div class="ta-toggle-form">
        <span>Don't have an account? </span>
        <a id="ta-show-register">Register</a>
      </div>
    `;

    // Create registration form
    const registerForm = document.createElement('div');
    registerForm.id = 'ta-register-form';
    registerForm.style.display = 'none';
    registerForm.innerHTML = `
      <h3 style="margin-top: 0; font-size: 1.2rem; text-align: center; color: #1976d2;">TripAdvisor Reviews</h3>
      <div class="ta-form-group">
        <label for="ta-register-email">Email:</label>
        <input type="email" id="ta-register-email" placeholder="Enter your email">
      </div>
      <button id="ta-register-btn" class="ta-button">Register</button>
      <div id="ta-register-error" class="ta-error-message"></div>
      <div id="ta-register-success" class="ta-success-message"></div>
      
      <!-- OTP Verification -->
      <div id="ta-otp-container" class="ta-otp-container">
        <div class="ta-form-group">
          <label for="ta-otp-input">Enter OTP sent to your email:</label>
          <input type="text" id="ta-otp-input" placeholder="Enter OTP">
        </div>
        <button id="ta-verify-otp-btn" class="ta-button">Verify OTP</button>
        <div id="ta-otp-error" class="ta-error-message"></div>
      </div>
      
      <div class="ta-toggle-form">
        <span>Already have an account? </span>
        <a id="ta-show-login">Login</a>
      </div>
    `;

    // Add forms to container
    authContainer.appendChild(loginForm);
    authContainer.appendChild(registerForm);
    document.body.appendChild(authContainer);

    // Add event listeners
    document.getElementById('ta-show-register').addEventListener('click', () => {
      document.getElementById('ta-login-form').style.display = 'none';
      document.getElementById('ta-register-form').style.display = 'block';
    });

    document.getElementById('ta-show-login').addEventListener('click', () => {
      document.getElementById('ta-register-form').style.display = 'none';
      document.getElementById('ta-login-form').style.display = 'block';
    });

    document.getElementById('ta-register-btn').addEventListener('click', registerUser);
    document.getElementById('ta-verify-otp-btn').addEventListener('click', verifyOTP);
    document.getElementById('ta-login-btn').addEventListener('click', loginUser);
  }

  // Function to generate random OTP
  function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Function to generate random user ID
  function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
  }

  // Function to assign a fixed reviewer version (1-5)
  function assignReviewerVersion() {
    return new Promise(resolve => {
      chrome.storage.local.get(['users_csv'], (result) => {
        if (!result.users_csv) {
          // First user gets version 1
          resolve(1);
          return;
        }
        
        // Count the number of lines (users) in the CSV
        const lines = result.users_csv.split('\n');
        // Subtract 1 for the header row, then mod 5 and add 1 to get a number between 1-5
        const userCount = lines.length - 1;
        const version = (userCount % 5) + 1;
        
        resolve(version);
      });
    });
  }

  // Function to register a new user
  async function registerUser() {
    const email = document.getElementById('ta-register-email').value.trim();
    const registerError = document.getElementById('ta-register-error');
    const registerSuccess = document.getElementById('ta-register-success');
    
    // Validate email
    if (!email || !email.includes('@')) {
      registerError.textContent = 'Please enter a valid email address';
      return;
    }
    
    // Check if user already exists
    const users = await loadUsers();
    if (users.find(user => user.email === email)) {
      registerError.textContent = 'This email is already registered';
      return;
    }
    
    // Generate OTP
    currentOTP = generateOTP();
    
    // In a real extension, you would send this OTP via email
    // For this implementation, we'll just display it (simulating email delivery)
    registerError.textContent = '';
    registerSuccess.textContent = `OTP sent to ${email}. For demo purposes, your OTP is: ${currentOTP}`;
    
    // Show OTP verification form
    document.getElementById('ta-otp-container').style.display = 'block';
  }

  // Function to verify OTP
  async function verifyOTP() {
    const email = document.getElementById('ta-register-email').value.trim();
    const otpInput = document.getElementById('ta-otp-input').value.trim();
    const otpError = document.getElementById('ta-otp-error');
    
    if (otpInput !== currentOTP) {
      otpError.textContent = 'Invalid OTP. Please try again.';
      return;
    }
    
    // OTP is valid, create new user
    const userId = generateUserId();
    // Use the fixed reviewer version assignment
    const reviewerVersion = await assignReviewerVersion();
    
    const newUser = {
      email,
      userId,
      reviewerVersion,
      registrationDate: new Date().toISOString()
    };
    
    // Save user to storage
    const users = await loadUsers();
    users.push(newUser);
    await saveUsers(users);
    
    // Set as current user
    currentUser = newUser;
    await saveCurrentUser(newUser);
    
    // Remove auth UI and initialize content script
    const authContainer = document.getElementById('ta-auth-container');
    if (authContainer) {
      authContainer.remove();
    }
    
    // Initialize the content script
    initializeContentScript();
  }

  // Function to login user
  async function loginUser() {
    const email = document.getElementById('ta-login-email').value.trim();
    const loginError = document.getElementById('ta-login-error');
    
    // Validate email
    if (!email || !email.includes('@')) {
      loginError.textContent = 'Please enter a valid email address';
      return;
    }
    
    // Check if user exists
    const users = await loadUsers();
    const user = users.find(user => user.email === email);
    
    if (!user) {
      loginError.textContent = 'Email not found. Please register first.';
      return;
    }
    
    // Set as current user
    currentUser = user;
    await saveCurrentUser(user);
    
    // Remove auth UI and initialize content script
    const authContainer = document.getElementById('ta-auth-container');
    if (authContainer) {
      authContainer.remove();
    }
    
    // Initialize the content script
    initializeContentScript();
  }

  // Function to load users from storage (CSV format)
  async function loadUsers() {
    return new Promise(resolve => {
      chrome.storage.local.get(['users_csv'], (result) => {
        if (!result.users_csv) {
          resolve([]);
          return;
        }
        
        // Parse CSV to array of user objects
        const lines = result.users_csv.split('\n');
        const headers = lines[0].split(',');
        
        const users = [];
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          
          const values = lines[i].split(',');
          const user = {};
          
          headers.forEach((header, index) => {
            // Remove quotes and unescape double quotes
            const value = values[index].replace(/^"|"$/g, '').replace(/""/g, '"');
            user[header] = value;
          });
          
          users.push(user);
        }
        
        resolve(users);
      });
    });
  }

  // Function to save users to storage (CSV format)
  async function saveUsers(users) {
    return new Promise(resolve => {
      if (users.length === 0) {
        // Initialize CSV with headers even if no users
        const headers = ['email', 'userId', 'reviewerVersion', 'registrationDate'];
        const csv = headers.join(',');
        chrome.storage.local.set({ users_csv: csv }, resolve);
        return;
      }
      
      // Ensure all required fields are present
      const headers = ['email', 'userId', 'reviewerVersion', 'registrationDate'];
      const csvLines = [
        headers.join(','),
        ...users.map(user => {
          // Ensure all fields are present and properly escaped
          return headers.map(header => {
            const value = user[header] || '';
            // Escape quotes and wrap in quotes if contains comma or quote
            return `"${value.toString().replace(/"/g, '""')}"`;
          }).join(',');
        })
      ];
      
      const csv = csvLines.join('\n');
      chrome.storage.local.set({ users_csv: csv }, resolve);
    });
  }

  // Function to save current user to storage
  async function saveCurrentUser(user) {
    return new Promise(resolve => {
      chrome.storage.local.set({ currentUser: user }, resolve);
    });
  }

  // Main content script functionality
  function initializeContentScript() {
    const GROQ_API_KEY = "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";

    // Retry hiding GAI_REVIEWS in case it loads dynamically
    let attempts = 0;
    const hideGAIInterval = setInterval(() => {
      const gaiDiv = document.getElementById("GAI_REVIEWS");
      if (gaiDiv) {
        gaiDiv.hidden = true;
        clearInterval(hideGAIInterval);
      }
      if (++attempts > 20) clearInterval(hideGAIInterval);
    }, 500);

    async function summarizeReviews(reviewsText) {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama3-70b-8192",
          messages: [{
            role: "user",
            content: `You are a review analyst. Summarize the following product or attraction reviews into a structured format with emoji headers and clear sections.

                    Please format the output exactly like this:
                    🏷️ Attraction:
                    [Insert attraction name, if known]

                    ⭐ Overall Rating:
                    [Summarize general sentiment — mention if reviews are mostly positive, mixed, or negative]

                    🏆 Key Highlights:
                    1. [Theme or category]
                      - [Detail 1]
                      - [Detail 2]
                      - [Detail 3]

                    2. [Next theme or category]
                      - [Detail 1]
                      - [Detail 2]

                    ⚠️ Common Criticisms:
                    1. [Category]
                      - [Critical observation 1]
                      - [Critical observation 2]

                    💡 Visitor Tips:
                    - [Tip 1]
                    - [Tip 2]

                    ✅ Recommended For:
                    - [Audience 1]
                    - [Audience 2]

                    Here are the reviews:
                    ${reviewsText}`
          }],
          temperature: 0.7
        })
      });

      const data = await response.json();
      if (data.error) {
        console.error("GROQ API Error:", data.error);
        return `Summary generation failed: ${data.error.message || data.error}`;
      }
      return data.choices?.[0]?.message?.content || "No summary generated.";
    }

    async function summarizeWithLLM(reviews) {
      const rawText = reviews.map(r => r.text).join(" ").slice(0, 3000);
      return await summarizeReviews(rawText);
    }

    function createAndShowPopup() {
      const popup = document.createElement("div");
      popup.id = "summarize-popup";

      // Updated styles to match TripAdvisor's review section styling
      Object.assign(popup.style, {
        margin: "20px 0",
        padding: "24px",
        backgroundColor: "#ffffff",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        border: "1px solid #e0e0e0",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"
      });

      // Add user info to the popup
      popup.innerHTML = `
          <div class="biGQs _P fiohW uuBRH" style="margin-bottom: 16px;">
              AI Summary Generator
          </div>
          <div style="margin-bottom: 10px; font-size: 0.9rem;">
              Logged in as: ${currentUser.email} | Reviewer Version: ${currentUser.reviewerVersion}
          </div>
          <div id="reviews">Loading reviews...</div>
          <button id="ta-logout-btn" class="ta-button" style="margin-top: 15px;">Logout</button>
      `;

      // Insert popup into TripAdvisor's review section
      const targetSection = document.querySelector(".MNtpD.f.e, div[class*='reviews-section']");
      if (targetSection) {
        // Insert after the ratings summary but before individual reviews
        const ratingsSection = targetSection.querySelector(".wtCeG.f, div[class*='ratings-section']");
        if (ratingsSection) {
          ratingsSection.parentNode.insertBefore(popup, ratingsSection.nextSibling);
        } else {
          targetSection.insertBefore(popup, targetSection.firstChild);
        }
      } else {
        // Fallback to body if review section not found
        document.body.appendChild(popup);
      }

      // Add logout functionality
      document.getElementById('ta-logout-btn').addEventListener('click', () => {
        chrome.storage.local.set({ currentUser: null }, () => {
          // Reload the page to show login form
          window.location.reload();
        });
      });

      renderReviews(document.getElementById("reviews"));
    }

    async function fetchReviews(tripUrl) {
      const actorUrl = `https://api.apify.com/v2/acts/maxcopell~tripadvisor-reviews/runs?token=apify_api_NmZq2zw77fXIYngqvcAfdhZJYZeKYT4Et65z`;
      const payload = {
        startUrls: [{ url: tripUrl, uniqueKey: Date.now().toString() }],
        maxReviews: 50,
        useStealth: true,
        proxyConfig: { useApifyProxy: true }
      };

      const startRun = await fetch(actorUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const runData = await startRun.json();
      const runId = runData.data.id;

      let status = "RUNNING";
      let attempts = 0;

      while ((status === "RUNNING" || status === "READY") && attempts < 15) {
        await new Promise((r) => setTimeout(r, 4000));
        const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=apify_api_NmZq2zw77fXIYngqvcAfdhZJYZeKYT4Et65z`);
        const statusData = await statusRes.json();
        status = statusData.data.status;
        attempts++;
      }

      const datasetId = runData.data.defaultDatasetId;
      const reviewRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=apify_api_NmZq2zw77fXIYngqvcAfdhZJYZeKYT4Et65z`);
      return await reviewRes.json();
    }

    async function autoSummarize(container, reviews) {
      // Add loading indicator
      const loadingDiv = document.createElement("div");
      loadingDiv.innerHTML = "<p style='margin: 10px 0;'>Generating Summary...</p>";
      container.prepend(loadingDiv);

      try {
        const summary = await summarizeWithLLM(reviews);
        const summaryDiv = document.createElement("div");
        summaryDiv.innerHTML = `
          <div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
            <h3 style="color: #2c3e50; margin-bottom: 10px;"></h3>
            <div style="white-space: pre-line; line-height: 1.5;">${summary}</div>
          </div>
        `;
        loadingDiv.remove();
        container.prepend(summaryDiv);
      } catch (error) {
        console.error('Summary generation error:', error);
        loadingDiv.innerHTML = "<p style='color: #dc3545;'>Failed to generate summary. Please try again.</p>";
      }
    }

    async function renderReviews(container) {
      const currentUrl = window.location.href;
      if (!currentUrl.includes("tripadvisor")) {
        container.innerHTML = "Please open a TripAdvisor page.";
        return;
      }

      const reviews = await fetchReviews(currentUrl);
      if (!reviews || reviews.length === 0) {
        container.innerHTML = "No reviews found.";
        return;
      }

      // Clear container first
      container.innerHTML = "";

      // Generate and display summary only
      await autoSummarize(container, reviews);
    }

    // Start the observer
    const observer = new MutationObserver(() => {
      const gaiDiv = document.getElementById("GAI_REVIEWS");
      if (gaiDiv) gaiDiv.hidden = true;

      if (!document.getElementById("summarize-popup")) {
        createAndShowPopup();
        observer.disconnect(); // Stop observing once popup is shown
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }
})();