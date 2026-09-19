# Google Apps Script Setup Guide

## Step 1: Create Google Sheet
1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new sheet named "Tools Feedback"
3. Add headers in row 1: `Timestamp | Name | Rating | Type | Message`

## Step 2: Create Apps Script
1. Go to [Google Apps Script](https://script.google.com)
2. Create new project
3. Replace all code with this:

```javascript
// Google Apps Script Code
const SHEET_ID = "YOUR_SHEET_ID"; // Copy from URL: docs.google.com/spreadsheets/d/{SHEET_ID}
const EMAIL = "alokk298690@gmail.com"; // Your email

function doPost(e) {
  try {
    const params = e.parameter;
    const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();

    // Save to Google Sheet
    sheet.appendRow([
      new Date().toLocaleString('en-IN'),
      params.name || '',
      (params.rating || '0') + '/5',
      params.type || '',
      params.message || ''
    ]);

    // Send email notification
    GmailApp.sendEmail(
      EMAIL,
      `New Feedback: ${params.type || 'General Feedback'}`,
      `Name: ${params.name || 'Anonymous'}\nRating: ${(params.rating || '0')}/5\nType: ${params.type || 'General Feedback'}\n\nMessage:\n${params.message}`
    );

    return ContentService.createTextOutput(
      JSON.stringify({ success: true, message: 'Form submitted successfully!' })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, message: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
} 
```

## Step 3: Deploy Script
1. Click **Deploy** → **New deployment**
2. Select type: **Web app**
3. Execute as: Your account
4. Who has access: **Anyone**
5. Click **Deploy**
6. Copy the deployment URL (looks like: `https://script.google.com/macros/d/{DEPLOYMENT_ID}/userweb`)

## Step 4: Update Your Site
Open `script.js` and paste the deployment URL on the line:

```javascript
const FEEDBACK_ENDPOINT = 'YOUR_GOOGLE_SCRIPT_DEPLOYMENT_URL';
```

so it looks like:

```javascript
const FEEDBACK_ENDPOINT = 'https://script.google.com/macros/d/YOUR_DEPLOYMENT_ID/userweb';
```

Done! Test by submitting the feedback form on your site. Each submission creates a new row in your sheet and sends an email with the name, rating, type, and message to your mailbox.
