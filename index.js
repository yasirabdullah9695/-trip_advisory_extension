const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('./credentials.json');


const app = express();
app.use(cors());
// Increase payload size limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ...rest of your routes and code...
const SHEET_ID = '1t2trgIDQClySTMSWKhPAO3q5Wz4_ukB6yIwEaZAOC9U';

// Initialize Google Sheets
async function initializeSheets() {
  const doc = new GoogleSpreadsheet(SHEET_ID);
  await doc.useServiceAccountAuth({
    client_email: creds.client_email,
    private_key: creds.private_key.replace(/\\n/g, '\n')
  });
  await doc.loadInfo();

  // Create UserTracking sheet if it doesn't exist
  let userTrackingSheet = doc.sheetsByTitle['UserTracking'];
  if (!userTrackingSheet) {
    userTrackingSheet = await doc.addSheet({
      title: 'UserTracking',
      headerValues: [
        'Timestamp', 'UserID', 'Email', 'ReviewerVersion', 'Action',
        'SessionDuration', 'SummaryViewDuration', 'CurrentURL', 'PageTitle',
        'ClickData', 'SessionStart', 'SessionEnd', 'TotalClicks', 'UniquePages'
      ]
    });
  }

  return { doc, userTrackingSheet };
}

// Initialize sheets on server start
let sheets;
initializeSheets().then(result => {
  sheets = result;
  console.log('✅ Google Sheets initialized successfully');
}).catch(error => {
  console.error('❌ Error initializing Google Sheets:', error);
});

// ROUTE: Track User Session
app.post('/track-session', async (req, res) => {
  try {
    const { 
      userId, email, reviewerVersion, timestamp, action, 
      sessionDuration, summaryViewDuration, currentUrl, pageTitle,
      pageClicks, sessionStart, sessionEnd, totalClicks, uniquePages
    } = req.body;

    if (!sheets) {
      sheets = await initializeSheets();
    }

    // Format click data as JSON string if it exists
    const clickData = pageClicks ? JSON.stringify(pageClicks) : '';

    // Add row to UserTracking sheet
    await sheets.userTrackingSheet.addRow({
      Timestamp: timestamp,
      UserID: userId,
      Email: email,
      ReviewerVersion: reviewerVersion,
      Action: action,
      SessionDuration: sessionDuration,
      SummaryViewDuration: summaryViewDuration,
      CurrentURL: currentUrl,
      PageTitle: pageTitle,
      ClickData: clickData,
      SessionStart: sessionStart || '',
      SessionEnd: sessionEnd || '',
      TotalClicks: totalClicks || 0,
      UniquePages: uniquePages || 0
    });

    res.status(200).json({ 
      result: 'success',
      message: 'Session data saved to UserTracking sheet'
    });

  } catch (error) {
    console.error('❌ Error tracking session:', error);
    res.status(500).json({ 
      error: 'Failed to track session',
      details: error.message 
    });
  }
});

// ROUTE 1: Register User
app.post('/register', async (req, res) => {
  try {
    const { email, userId, reviewerVersion, registrationDate } = req.body;

    const doc = new GoogleSpreadsheet(SHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: creds.client_email,
      private_key: creds.private_key.replace(/\\n/g, '\n')
    });
    await doc.loadInfo();

    const sheet = doc.sheetsByIndex[0]; // User registration sheet
    await sheet.addRow({ email, userId, reviewerVersion, registrationDate });

    res.status(200).json({ result: 'success' });
  } catch (error) {
    console.error('❌ Error writing to Google Sheet:', error);
    res.status(500).json({ error: 'Failed to write to sheet' });
  }
});

// ROUTE 2: Get Summary for TripAdvisor URL
app.get('/summary', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing URL parameter' });

  try {
    const doc = new GoogleSpreadsheet(SHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: creds.client_email,
      private_key: creds.private_key.replace(/\\n/g, '\n')
    });
    await doc.loadInfo();

    const summarySheet = doc.sheetsByTitle['Summaries'];
    if (!summarySheet) return res.status(404).json({ error: 'Sheet \"Summaries\" not found.' });

    const rows = await summarySheet.getRows();
    const matchedRow = rows.find(row => row.URL === url);

    if (matchedRow) {
      return res.status(200).json({
        whitelisted: true,
        summary: matchedRow.Summary || null
      });
    } else {
      return res.status(403).json({ whitelisted: false, summary: null, error: 'URL not whitelisted' });
    }
  } catch (error) {
    console.error('❌ Error reading from sheet:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/final-review', async (req, res) => {
  try {
    const { url, reviewerVersion, summary, reviews } = req.body;

    // Validate reviews data
    if (!reviews) {
      return res.status(400).json({ error: 'Reviews data is required' });
    }

    // Process reviews based on their format
    const formattedReviews = Array.isArray(reviews) 
      ? reviews
          .slice(0, 50) // Limit to 50 reviews
          .map(review => review.text || review) // Extract text from review objects
          .filter(Boolean) // Remove any empty reviews
          .join('\n---\n') 
      : typeof reviews === 'string'
          ? reviews.slice(0, 50000) 
          : JSON.stringify(reviews); // Fallback for other formats

    const doc = new GoogleSpreadsheet(SHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: creds.client_email,
      private_key: creds.private_key.replace(/\\n/g, '\n')
    });
    await doc.loadInfo();

    const sheet = doc.sheetsByTitle['FinalReviews'];
    if (!sheet) {
      return res.status(404).json({ error: 'Sheet "FinalReviews" not found.' });
    }

    // Add row with processed reviews
    await sheet.addRow({
      URL: url,
      ReviewerVersion: reviewerVersion,
      Summary: summary || '',
      Reviews: formattedReviews,
      DateAdded: new Date().toISOString(),
      ReviewCount: Array.isArray(reviews) ? reviews.length : 1
    });

    res.status(200).json({ 
      result: 'success',
      message: 'Reviews successfully saved to sheet',
      reviewCount: Array.isArray(reviews) ? reviews.length : 1
    });

  } catch (error) {
    console.error('❌ Error writing to FinalReviews sheet:', error);
    res.status(500).json({ 
      error: 'Failed to write to FinalReviews sheet',
      details: error.message 
    });
  }
});


const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Server is running on http://localhost:${PORT}`));
