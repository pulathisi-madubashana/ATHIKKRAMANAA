# Google Sheets Auto-Sync Setup Guide

## Overview
After following this guide, every registration, check-in, and manual edit made through the local Node.js server will **automatically update your Google Sheet** in real time.

---

## Step 1 — Create a Google Cloud Project

1. Go to **[https://console.cloud.google.com/](https://console.cloud.google.com/)** and sign in.
2. Click **"Select a project"** → **"New Project"**.
3. Name it `Athikkramana` and click **Create**.

---

## Step 2 — Enable the Google Sheets API

1. In the Cloud Console, go to **APIs & Services → Library**.
2. Search for **Google Sheets API** and click **Enable**.

---

## Step 3 — Create a Service Account

1. Go to **APIs & Services → Credentials**.
2. Click **"+ Create Credentials" → "Service account"**.
3. Give it any name (e.g. `athikkramana-sync`) and click **Create and Continue**.
4. Skip optional steps and click **Done**.

---

## Step 4 — Download the JSON Key

1. On the Credentials page, click your new service account.
2. Go to the **Keys** tab → **Add Key → Create new key → JSON**.
3. A file is downloaded. **Rename it to `service-account.json`** and place it in the project root:

```
Athikkramana/
├── server.js
├── db.js
├── sheets-sync.js
├── service-account.json   ← place it here
└── ...
```

> ⚠️ **Never share or commit `service-account.json` to GitHub!**

---

## Step 5 — Create & Share the Google Sheet

1. Create a new Google Sheet at **[https://sheets.google.com](https://sheets.google.com)**.
2. Name the first sheet tab **`Registrations`** (exact spelling).
3. Copy the Spreadsheet ID from the URL:
   - URL: `https://docs.google.com/spreadsheets/d/`**`1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms`**`/edit`
   - The bold part is your Spreadsheet ID.

4. Open the service-account.json you downloaded, find the `"client_email"` field (looks like `athikkramana-sync@yourproject.iam.gserviceaccount.com`).
5. In your Google Sheet, click **Share** and add that email as an **Editor**.

---

## Step 6 — Set the Spreadsheet ID

Open `sheets-sync.js` and replace the empty string with your Spreadsheet ID:

```js
const SPREADSHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE';
```

Or set it as an environment variable before starting the server:

```powershell
$env:SPREADSHEET_ID = "PASTE_YOUR_SPREADSHEET_ID_HERE"
npm run dev
```

---

## Step 7 — Restart the Server

```powershell
npm run dev
```

You should see in the console:
```
[sheets-sync] Google Sheets client initialised.
```

From now on:
- ✅ **New registration** → row appended to the Sheet instantly
- ✅ **Check-in** → that row updated in the Sheet
- ✅ **Manual edit (admin)** → that row updated in the Sheet

---

## Manual Full Sync (optional)

If you want to push ALL existing local records to the Sheet at once, run:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/sync" -Method POST
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `service-account.json not found` | Make sure the file is in the project root folder |
| `SPREADSHEET_ID is not set` | Set the ID in `sheets-sync.js` or as `$env:SPREADSHEET_ID` |
| `403 Forbidden` from Sheets API | Share the Sheet with the service account email (Editor) |
| `The caller does not have permission` | Re-check that Google Sheets API is enabled in Cloud Console |
