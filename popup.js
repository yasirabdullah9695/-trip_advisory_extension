// User Authentication Functions
let currentUser = null;
let currentOTP = null;

// Load user data from storage on popup open
document.addEventListener('DOMContentLoaded', () => {
  // Check if user is already logged in
  chrome.storage.local.get(['currentUser'], (result) => {
    if (result.currentUser) {
      currentUser = result.currentUser;
      showContent();
    } else {
      showAuth();
    }
  });

  // Set up event listeners for auth forms
  document.getElementById('show-register').addEventListener('click', () => {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
  });

  document.getElementById('show-login').addEventListener('click', () => {
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
  });

  document.getElementById('register-btn').addEventListener('click', registerUser);
  document.getElementById('verify-otp-btn').addEventListener('click', verifyOTP);
  document.getElementById('login-btn').addEventListener('click', loginUser);
  document.getElementById('logout-btn').addEventListener('click', logoutUser);
});

// Function to generate random OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Function to generate random user ID
function generateUserId() {
  return 'user_' + Math.random().toString(36).substr(2, 9);
}

// Function to generate random reviewer version (1-5)
function generateReviewerVersion() {
  return Math.floor(Math.random() * 5) + 1;
}

// Function to register a new user
async function registerUser() {
  const email = document.getElementById('register-email').value.trim();
  const registerError = document.getElementById('register-error');
  const registerSuccess = document.getElementById('register-success');
  
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
  document.getElementById('otp-container').style.display = 'block';
}

// Function to verify OTP
async function verifyOTP() {
  const email = document.getElementById('register-email').value.trim();
  const otpInput = document.getElementById('otp-input').value.trim();
  const otpError = document.getElementById('otp-error');
  
  if (otpInput !== currentOTP) {
    otpError.textContent = 'Invalid OTP. Please try again.';
    return;
  }
  
  // OTP is valid, create new user
  const userId = generateUserId();
  const reviewerVersion = generateReviewerVersion();
  
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
  
  // Show content
  showContent();
}

// Function to login user
async function loginUser() {
  const email = document.getElementById('login-email').value.trim();
  const loginError = document.getElementById('login-error');
  
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
  
  // Show content
  showContent();
}

// Function to logout user
async function logoutUser() {
  currentUser = null;
  await saveCurrentUser(null);
  showAuth();
}

// Function to show authentication forms
function showAuth() {
  document.getElementById('auth-container').style.display = 'block';
  document.getElementById('content-container').style.display = 'none';
}

// Function to show content after authentication
function showContent() {
  document.getElementById('auth-container').style.display = 'none';
  document.getElementById('content-container').style.display = 'block';
  
  // Display user info
  const userInfo = document.getElementById('user-info');
  userInfo.textContent = `Logged in as: ${currentUser.email} | Reviewer Version: ${currentUser.reviewerVersion}`;
  
  // Load reviews
  renderReviews();
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
          user[header] = values[index];
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

// Existing functions for fetching and displaying reviews
async function getActiveTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.location.href,
  });
  return result.result;
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

async function summarizeWithLLM(reviews) {
  const rawText = reviews.map(r => r.text).join(" ").slice(0, 3000);
  const response = await fetch("https://api-inference.huggingface.co/models/facebook/bart-large-cnn", {
    method: "POST",
    headers: {
      "Authorization": "Bearer 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",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: `Summarize the following TripAdvisor reviews:\n\n${rawText}`
    })
  });

  const data = await response.json();

  if (data.error) {
    console.error("Hugging Face API Error:", data.error);
    return ` Summary generation failed: ${data.error}`;
  }

  return data[0]?.summary_text || " No summary generated.";
}

let scrapedReviews = [];

async function renderReviews() {
  const reviewsContainer = document.getElementById("reviews");
  reviewsContainer.innerHTML = "loading...";

  const currentUrl = await getActiveTabUrl();
  if (!currentUrl.includes("tripadvisor")) {
    reviewsContainer.innerHTML = " Please open a TripAdvisor page.";
    return;
  }

  scrapedReviews = await fetchReviews(currentUrl);

  if (!scrapedReviews || scrapedReviews.length === 0) {
    reviewsContainer.innerHTML = "No reviews found.";
    return;
  }

  const summarizeBtn = document.createElement("button");
  summarizeBtn.textContent = "Summarize Reviews";
  summarizeBtn.onclick = async () => {
    summarizeBtn.textContent = "Summarizing...";
    summarizeBtn.disabled = true;

    const summary = await summarizeWithLLM(scrapedReviews);
    const summaryDiv = document.createElement("div");
    summaryDiv.innerHTML = `<strong> AI Summary:</strong><p>${summary}</p><hr>`;
    reviewsContainer.prepend(summaryDiv);

    summarizeBtn.textContent = "Summarized";
  };

  const downloadBtn = document.createElement("button");
  downloadBtn.textContent = "Download as CSV";
  downloadBtn.onclick = () => {
    if (!scrapedReviews || scrapedReviews.length === 0) {
      alert("No reviews available to download.");
      return;
    }

    const headers = ["title", "rating", "text"];
    const csvRows = [
      headers.join(","),
      ...scrapedReviews.map(r =>
        headers.map(h => `"${(r[h] || "").toString().replace(/"/g, '""')}"`).
        join(",")
      )
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tripadvisor_reviews.csv";
    a.click();
  };

  reviewsContainer.innerHTML = "";
  reviewsContainer.appendChild(summarizeBtn);
  reviewsContainer.appendChild(downloadBtn);

  scrapedReviews.forEach((review) => {
    const div = document.createElement("div");
    div.className = "review";
    div.innerHTML = `<strong>${review.title || 'No title'}</strong><br/>
                     <em>${review.rating || 'N/A'} ⭐</em><br/>
                     <p>${review.text || 'No text'}</p>`;
    reviewsContainer.appendChild(div);
  });
}