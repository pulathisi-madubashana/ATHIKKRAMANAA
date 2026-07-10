const fs = require('fs');
const path = require('path');
const sync = require('./sheets-sync');
const auth = require('./auth');

const sender = require('./whatsapp/sender');

const DATA_DIR = path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const REGISTRATIONS_FILE = path.join(DATA_DIR, 'registrations.json');

// Initialize database
function initDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // 1. Initialize Settings
  if (!fs.existsSync(SETTINGS_FILE)) {
    const defaultSettings = {
      "Total Seats": "4000",
      "Event Name": "Buddhist Overnight Dhamma Program",
      "Venue": "Dhamma Hall Auditorium",
      "Date": "2026-07-15",
      "Admin Username": "admin",
      "Admin Password": "Dhamma2026"
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2), 'utf8');
  }

  // 2. Initialize Registrations
  if (!fs.existsSync(REGISTRATIONS_FILE)) {
    fs.writeFileSync(REGISTRATIONS_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

// Read helper
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return [];
  }
}

// Write helper
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// Get Setting
function getSetting(key) {
  const settings = readJSON(SETTINGS_FILE);
  return settings[key] || "";
}

// Save Setting
function saveSetting(key, value) {
  const settings = readJSON(SETTINGS_FILE);
  settings[key] = value;
  writeJSON(SETTINGS_FILE, settings);
  return true;
}

// Authenticate Admin
function authenticateAdmin(username, password) {
  const adminUser = getSetting("Admin Username") || "admin";
  const adminPass = getSetting("Admin Password") || "Dhamma2026";
  const valid = (username === adminUser && password === adminPass);
  sync.appendLogRow('Admin Login Attempt', valid ? 'Successful login' : 'Failed login attempt', username).catch(() => {});
  return valid;
}

// Get Dashboard Stats
function getDashboardStats() {
  const regs = readJSON(REGISTRATIONS_FILE);
  const totalCapacity = parseInt(getSetting("Total Seats") || "4000");
  const totalRegistered = regs.length;

  let checkedIn = 0;
  let reserved = 0;
  for (const r of regs) {
    if (r.status === "Checked In") checkedIn++;
    else if (r.status === "Reserved") reserved++;
  }

  const availableSlots = Math.max(0, totalCapacity - totalRegistered);

  // Today's count
  const today = new Date().toDateString();
  let todayRegCount = 0;
  for (const r of regs) {
    if (r.registeredDate && new Date(r.registeredDate).toDateString() === today) {
      todayRegCount++;
    }
  }

  // Latest 10 registrations
  const latestRegs = [];
  const start = Math.max(0, regs.length - 10);
  for (let i = regs.length - 1; i >= start; i--) {
    const r = regs[i];
    latestRegs.push({
      id: r.id,
      name: r.name,
      nic: r.nic,
      phone: r.phone,
      whatsapp: r.whatsapp,
      district: r.district,
      status: r.status,
      date: r.registeredDate ? new Date(r.registeredDate).toLocaleDateString() : "N/A"
    });
  }

  return {
    totalSeats: totalCapacity,
    availableSeats: availableSlots,
    reservedSeats: reserved,
    checkedInSeats: checkedIn,
    todayRegistrations: todayRegCount,
    latestRegistrations: latestRegs,
    eventName: getSetting("Event Name"),
    venue: getSetting("Venue"),
    date: getSetting("Date")
  };
}

// Save New Registration
function saveNewRegistration(regData) {
  const regs = readJSON(REGISTRATIONS_FILE);
  const inputName = String(regData.fullName).trim().toLowerCase();
  const inputNic = (regData.nic || "").toString().trim().toLowerCase();

  // Check duplicate name or NIC
  for (const r of regs) {
    const rNic = (r.nic || "").toString().trim().toLowerCase();
    const isDuplicateNic = inputNic !== "" && rNic === inputNic;
    if (String(r.name).trim().toLowerCase() === inputName || isDuplicateNic) {
      return {
        success: false,
        alreadyRegistered: true,
        message: "Already Registered",
        registrant: {
          id: r.id,
          name: r.name,
          nic: r.nic,
          phone: r.phone,
          whatsapp: r.whatsapp,
          district: r.district,
          status: r.status,
          qrCode: r.qrCode
        }
      };
    }
  }

  const totalCapacity = parseInt(getSetting("Total Seats") || "4000");
  if (regs.length >= totalCapacity) {
    return {
      success: false,
      message: "Registration Limit Reached! Maximum capacity of " + totalCapacity + " registrants has been filled."
    };
  }

  // Generate Reg ID (ATK-XXXX)
  let nextNum = 1;
  if (regs.length > 0) {
    const lastId = regs[regs.length - 1].id;
    const match = lastId.match(/ATK-(\d+)/);
    if (match) {
      nextNum = parseInt(match[1]) + 1;
    }
  }
  const regId = "ATK-" + String(nextNum).padStart(4, '0');
  const sig = auth.generateQRSig(regId);
  const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=" + encodeURIComponent(JSON.stringify({ id: regId, sig: sig }));
  const today = new Date().toISOString();

  const newReg = {
    id: regId,
    name: regData.fullName,
    nic: regData.nic,
    phone: regData.phone,
    whatsapp: regData.whatsapp || regData.phone,
    district: regData.district,
    qrCode: qrUrl,
    status: "Reserved",
    registeredDate: today,
    checkedInTime: ""
  };

  regs.push(newReg);
  writeJSON(REGISTRATIONS_FILE, regs);

  // Async Google Sheets sync (non-blocking)
  sync.appendRegistration(newReg).catch(err => console.error('[db] Sheets sync error:', err.message));
  sync.appendLogRow('New Registration', `Reg ID: ${regId} | Name: ${newReg.name} | District: ${newReg.district}`, 'System').catch(() => {});

  // Fire and forget WhatsApp ticket
  dispatchWhatsAppTicket(newReg.whatsapp, newReg).catch(err => console.error('[db] WhatsApp dispatch error:', err));

  return {
    success: true,
    registrationId: regId,
    qrUrl: qrUrl
  };
}

// Search registrations
function searchRegistrations(query) {
  const regs = readJSON(REGISTRATIONS_FILE);
  if (!query) {
    // Return all for empty query (reports)
    return regs.map(r => ({
      id: r.id,
      name: r.name,
      nic: r.nic,
      phone: r.phone,
      whatsapp: r.whatsapp,
      district: r.district,
      qrCode: r.qrCode,
      status: r.status,
      date: r.registeredDate ? new Date(r.registeredDate).toLocaleDateString() : "",
      checkedInTime: r.checkedInTime ? new Date(r.checkedInTime).toLocaleString() : ""
    }));
  }

  const q = String(query).toLowerCase().trim();
  const results = [];

  for (const r of regs) {
    if (String(r.id).toLowerCase().includes(q) ||
        String(r.name).toLowerCase().includes(q) ||
        String(r.nic).toLowerCase().includes(q) ||
        String(r.phone).toLowerCase().includes(q)) {
      results.push({
        id: r.id,
        name: r.name,
        nic: r.nic,
        phone: r.phone,
        whatsapp: r.whatsapp,
        district: r.district,
        qrCode: r.qrCode,
        status: r.status,
        date: r.registeredDate ? new Date(r.registeredDate).toLocaleDateString() : "",
        checkedInTime: r.checkedInTime ? new Date(r.checkedInTime).toLocaleString() : ""
      });
    }
  }

  return results;
}

// Verify and Check In
function verifyAndCheckIn(registrationId, signature) {
  const regs = readJSON(REGISTRATIONS_FILE);

  const regIndex = regs.findIndex(r => r.id === registrationId);
  if (regIndex === -1) {
    return { success: false, message: "Invalid Registration Code: " + registrationId };
  }

  // Verify Cryptographic Signature
  const expectedSig = auth.generateQRSig(registrationId);
  if (!signature || signature !== expectedSig) {
    return { success: false, message: "FAKE OR INVALID QR CODE DETECTED! Unauthorized entry attempt." };
  }

  const currentReg = regs[regIndex];
  if (currentReg.status === "Checked In") {
    const prevTime = currentReg.checkedInTime ? new Date(currentReg.checkedInTime).toLocaleString() : "Unknown";
    return {
      success: false,
      alreadyCheckedIn: true,
      message: "Already Checked In",
      previousTime: prevTime,
      data: {
        id: currentReg.id,
        name: currentReg.name,
        phone: currentReg.phone,
        district: currentReg.district,
        status: currentReg.status,
        checkedInTime: prevTime
      }
    };
  }

  const checkInTime = new Date().toISOString();

  // Update Registrations sheet
  regs[regIndex].status = "Checked In";
  regs[regIndex].checkedInTime = checkInTime;

  writeJSON(REGISTRATIONS_FILE, regs);

  // Async Google Sheets sync (non-blocking)
  sync.updateRegistrationRow(regs[regIndex]).catch(err => console.error('[db] Sheets sync error:', err.message));
  sync.appendLogRow('QR Check-in', `Reg ID: ${regs[regIndex].id} | Name: ${currentReg.name}`, 'QR Scanner').catch(() => {});

  return {
    success: true,
    message: "Check-in Successful!",
    data: {
      id: currentReg.id,
      name: currentReg.name,
      phone: currentReg.phone,
      district: currentReg.district,
      status: "Checked In",
      checkedInTime: new Date(checkInTime).toLocaleString()
    }
  };
}

// Update Registration Details manually
function updateRegistration(regId, updatedData) {
  const regs = readJSON(REGISTRATIONS_FILE);
  const regIndex = regs.findIndex(r => r.id === regId);
  if (regIndex === -1) {
    return { success: false, message: "Registration not found: " + regId };
  }

  // Update fields
  regs[regIndex].name = updatedData.name;
  regs[regIndex].nic = updatedData.nic;
  regs[regIndex].phone = updatedData.phone;
  regs[regIndex].whatsapp = updatedData.whatsapp || updatedData.phone;
  regs[regIndex].district = updatedData.district;
  regs[regIndex].status = updatedData.status;
  
  if (updatedData.status === "Checked In" && !regs[regIndex].checkedInTime) {
    regs[regIndex].checkedInTime = new Date().toISOString();
  } else if (updatedData.status !== "Checked In") {
    regs[regIndex].checkedInTime = "";
  }

  writeJSON(REGISTRATIONS_FILE, regs);

  // Async Google Sheets sync (non-blocking)
  sync.updateRegistrationRow(regs[regIndex]).catch(err => console.error('[db] Sheets sync error:', err.message));
  sync.appendLogRow('Update Registration', `Reg ID: ${regId} | Name: ${updatedData.name}`, 'Admin').catch(() => {});

  return { success: true, message: "Registration updated successfully!" };
}

// Delete Registration
function deleteRegistration(regId) {
  const regs = readJSON(REGISTRATIONS_FILE);
  const regIndex = regs.findIndex(r => r.id === regId);
  if (regIndex === -1) {
    return { success: false, message: "Registration not found: " + regId };
  }

  const deletedReg = regs[regIndex];
  regs.splice(regIndex, 1);
  writeJSON(REGISTRATIONS_FILE, regs);

  // Async Google Sheets sync - delete the row (non-blocking)
  sync.deleteRegistrationRow(regId).catch(err => console.error('[db] Sheets sync error:', err.message));
  sync.appendLogRow('Delete Registration', `Reg ID: ${regId} | Name: ${deletedReg.name} | Phone: ${deletedReg.phone}`, 'Admin').catch(() => {});

  return { success: true, message: "Registration deleted successfully." };
}

// WhatsApp Dispatch Helper
function updateWhatsAppStatus(regId, status) {
  const regs = readJSON(REGISTRATIONS_FILE);
  const reg = regs.find(r => r.id === regId);
  if (reg) {
    reg.whatsappStatus = status;
    writeJSON(REGISTRATIONS_FILE, regs);
  }
}

async function dispatchWhatsAppTicket(phone, regData, retries = 3) {
  if (!phone) return { success: false, message: 'No phone number provided' };
  
  const caption = `🙏 තෙරුවන් සරණයි !!!

ඔබ සාර්ථකව ලියාපදිංචි වී ඇති බව සතුටින් දන්වමු.

📋 ඔබගේ ලියාපදිංචි විස්තර

> • 🎟️ Registration No: ${regData.id}
> • 👤 Participant: ${regData.name}
> • 🪪 ID Number: ${regData.nic}
> • 📱 WhatsApp Number: ${regData.whatsapp}
> • 📅 Program Date: 25 August 2026
> • 🕘 Program Time: 09.00 AM (කරුණාකර පෙ.ව. 8.30ට පෙර පැමිණෙන්න.)
> • 📍 Venue: BMICH, Colombo

📍 Location:
https://maps.app.goo.gl/VpRePEaNvLBHVJEZ6?g_st=ac

වැඩසටහනට පැමිණෙන විට මෙම WhatsApp පණිවිඩය සමඟ ලැබෙන QR Ticket එක අනිවාර්යයෙන්ම ඉදිරිපත් කරන්න.

📌 වැදගත් දැනුම්දීම

• QR Ticket එක පෙන්වා පමණක් ශාලාවට ඇතුළු විය හැක.
• වැඩසටහන ආරම්භයට අවම වශයෙන් විනාඩි 30කට පෙර පැමිණෙන්න.
• මෙම QR Ticket එක ලියාපදිංචි වූ පුද්ගලයාට පමණක් වලංගු වන අතර වෙනත් අයෙකුට භාවිතා කළ නොහැක.
• 📖 ධර්ම දේශනා අත්පත්‍රිකාව සහ 🍱 දිවා ආහාරය සියලුම සහභාගිවන්නන් සඳහා ලබා දෙනු ඇත.

📞 විමසීම් : 076 098 0980

🙏 තෙරුවන් සරණයි!`;
  
  let res;
  for (let i = 0; i < retries; i++) {
    res = await sender.sendWhatsAppTicket(phone, regData, caption);
    if (res.success) {
      updateWhatsAppStatus(regData.id, 'sent');
      return res;
    }
    await new Promise(r => setTimeout(r, 2000)); // wait 2s before retry
  }
  updateWhatsAppStatus(regData.id, 'failed');
  return res;
}

// Resend WhatsApp Ticket manually
async function resendWhatsAppTicket(regId) {
  const regs = readJSON(REGISTRATIONS_FILE);
  const reg = regs.find(r => r.id === regId);
  if (!reg) return { success: false, message: 'Registration not found' };
  
  const res = await dispatchWhatsAppTicket(reg.whatsapp, reg, 1);
  return res;
}

module.exports = {
  initDatabase,
  getSetting,
  saveSetting,
  authenticateAdmin,
  getDashboardStats,
  saveNewRegistration,
  searchRegistrations,
  verifyAndCheckIn,
  updateRegistration,
  deleteRegistration,
  resendWhatsAppTicket
};
