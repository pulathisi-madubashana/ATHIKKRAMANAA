/**
 * sheets-sync.js
 * Handles automatic syncing of local JSON data to a Google Sheets spreadsheet.
 */

const path = require('path');
const fs   = require('fs');

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
const SPREADSHEET_ID     = process.env.SPREADSHEET_ID || '1KsyDUOCeTfFU9BxuAgRWe9sEsZGweV7dzpksBeLQfw0';
const SHEET_NAME         = 'Registrations';
const LOGS_SHEET_NAME    = 'Audit Logs';
const WA_LOGS_SHEET_NAME = 'WhatsApp Logs';
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'service-account.json');
// ──────────────────────────────────────────────────────────────────────────────

let sheetsClient = null;

// ─── CLIENT INIT ──────────────────────────────────────────────────────────────
async function getClient() {
  if (sheetsClient) return sheetsClient;

  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.warn('[sheets-sync] service-account.json not found – sync disabled.');
    return null;
  }

  try {
    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({
      keyFile: SERVICE_ACCOUNT_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('[sheets-sync] ✓ Google Sheets client ready.');
    return sheetsClient;
  } catch (err) {
    console.error('[sheets-sync] Init error:', err.message);
    return null;
  }
}

// ─── ENSURE SHEET TAB EXISTS ──────────────────────────────────────────────────
/**
 * Makes sure a sheet tab exists.
 * If not, creates it and writes the header row.
 */
async function ensureSheet(sheets, sheetTitle, headers) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetList = meta.data.sheets.map(s => s.properties.title);

  if (!sheetList.includes(sheetTitle)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          addSheet: { properties: { title: sheetTitle } }
        }]
      }
    });
    console.log(`[sheets-sync] Created sheet tab "${sheetTitle}".`);
  }

  // Write header if row 1 is empty
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetTitle}!A1:Z1`,
  }).catch(() => null);

  const firstRow = headerRes && headerRes.data.values && headerRes.data.values[0];
  if (!firstRow || firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetTitle}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] }
    });
    console.log(`[sheets-sync] Header row written for "${sheetTitle}".`);
  }
}

// ─── FIND ROW BY REG ID ───────────────────────────────────────────────────────
async function findRowByRegId(sheets, regId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:A`,
  }).catch(() => null);

  if (!res || !res.data.values) return -1;
  const rows = res.data.values;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(regId)) return i + 1; // 1-based sheet row
  }
  return -1;
}

// ─── ROW BUILDER ──────────────────────────────────────────────────────────────
function toRow(reg) {
  return [
    reg.id,
    reg.name,
    reg.nic,
    reg.phone,
    reg.whatsapp || reg.phone,
    reg.district,
    reg.qrCode,
    reg.status,
    reg.registeredDate || '',
    reg.checkedInTime  || ''
  ];
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Append a new registration to the sheet.
 */
async function appendRegistration(reg) {
  const sheets = await getClient();
  if (!sheets) return;

  try {
    const headers = ['Registration ID', 'Full Name', 'NIC', 'Phone Number', 'WhatsApp Number', 'District', 'QR Code', 'Status', 'Registered Date', 'Checked In Time'];
    await ensureSheet(sheets, SHEET_NAME, headers);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:J`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [toRow(reg)] }
    });
    console.log(`[sheets-sync] ✓ Appended ${reg.id}`);
  } catch (err) {
    console.error('[sheets-sync] appendRegistration error:', err.message);
  }
}

/**
 * Update an existing registration row (or append if not found).
 */
async function updateRegistrationRow(reg) {
  const sheets = await getClient();
  if (!sheets) return;

  try {
    const headers = ['Registration ID', 'Full Name', 'NIC', 'Phone Number', 'WhatsApp Number', 'District', 'QR Code', 'Status', 'Registered Date', 'Checked In Time'];
    await ensureSheet(sheets, SHEET_NAME, headers);
    const rowNum = await findRowByRegId(sheets, reg.id);

    if (rowNum === -1) {
      return appendRegistration(reg);
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${rowNum}:J${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [toRow(reg)] }
    });
    console.log(`[sheets-sync] ✓ Updated ${reg.id} (row ${rowNum})`);
  } catch (err) {
    console.error('[sheets-sync] updateRegistrationRow error:', err.message);
  }
}

/**
 * Full sync – clear all data rows and rewrite from scratch.
 */
async function fullSync(regs) {
  const sheets = await getClient();
  if (!sheets) return;

  try {
    const headers = ['Registration ID', 'Full Name', 'NIC', 'Phone Number', 'WhatsApp Number', 'District', 'QR Code', 'Status', 'Registered Date', 'Checked In Time'];
    await ensureSheet(sheets, SHEET_NAME, headers);

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2:J`,
    });

    if (regs.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A2`,
        valueInputOption: 'RAW',
        requestBody: { values: regs.map(toRow) }
      });
    }

    console.log(`[sheets-sync] ✓ Full sync done – ${regs.length} rows.`);
  } catch (err) {
    console.error('[sheets-sync] fullSync error:', err.message);
  }
}

/**
 * Delete a registration row from the Google Sheet by Reg ID.
 */
async function deleteRegistrationRow(regId) {
  const sheets = await getClient();
  if (!sheets) return;

  try {
    const headers = ['Registration ID', 'Full Name', 'NIC', 'Phone Number', 'WhatsApp Number', 'District', 'QR Code', 'Status', 'Registered Date', 'Checked In Time'];
    await ensureSheet(sheets, SHEET_NAME, headers);

    // Find sheet row number
    const rowNum = await findRowByRegId(sheets, regId);
    if (rowNum === -1) {
      console.log(`[sheets-sync] Row for ${regId} not found – nothing to delete.`);
      return;
    }

    // Get the sheet tab's sheetId
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheetMeta = meta.data.sheets.find(s => s.properties.title === SHEET_NAME);
    if (!sheetMeta) return;
    const sheetId = sheetMeta.properties.sheetId;

    // Delete the specific row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: rowNum - 1,  // 0-based
              endIndex: rowNum         // exclusive
            }
          }
        }]
      }
    });

    console.log(`[sheets-sync] ✓ Deleted row for ${regId} from Google Sheets.`);
  } catch (err) {
    console.error('[sheets-sync] deleteRegistrationRow error:', err.message);
  }
}

/**
 * Append an audit log entry to the "Audit Logs" sheet.
 */
async function appendLogRow(action, details, user = 'System') {
  const sheets = await getClient();
  if (!sheets) return;

  try {
    const headers = ['Timestamp', 'Action', 'Details', 'User/Source'];
    await ensureSheet(sheets, LOGS_SHEET_NAME, headers);
    
    const timestamp = new Date().toLocaleString();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LOGS_SHEET_NAME}!A:D`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[timestamp, action, details, user]] }
    });
    console.log(`[sheets-sync] ✓ Logged: [${action}] ${details}`);
  } catch (err) {
    console.error('[sheets-sync] appendLogRow error:', err.message);
  }
}

/**
 * Append a WhatsApp log entry to the "WhatsApp Logs" sheet.
 */
async function appendWhatsAppLog(phone, message, status) {
  const sheets = await getClient();
  if (!sheets) return;

  try {
    const headers = ['Timestamp', 'Phone', 'Status', 'Message'];
    await ensureSheet(sheets, WA_LOGS_SHEET_NAME, headers);
    
    const timestamp = new Date().toLocaleString();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${WA_LOGS_SHEET_NAME}!A:D`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[timestamp, phone, status, message]] }
    });
    console.log(`[sheets-sync] ✓ Logged WhatsApp: [${status}] to ${phone}`);
  } catch (err) {
    console.error('[sheets-sync] appendWhatsAppLog error:', err.message);
  }
}

module.exports = { appendRegistration, updateRegistrationRow, fullSync, deleteRegistrationRow, appendLogRow, appendWhatsAppLog };
