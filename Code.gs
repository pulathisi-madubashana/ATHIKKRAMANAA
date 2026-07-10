/**
 * Code.gs - Consolidated Google Apps Script Server-Side Code
 * Contains database initialization, registration, seat management, and scan check-in verification.
 */

function doGet(e) {
  // Ensure DB is initialized
  initDatabase();
  
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Athikkramana - Event Registration & Seat Management")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ==========================================
// DATABASE (Google Sheets) OPERATIONS
// ==========================================

// Initialize sheets if they do not exist
function initDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    Logger.log("Active spreadsheet not found. Make sure this script is bound to a Google Sheet.");
    return;
  }
  
  // 1. Setup Settings sheet
  var settingsSheet = ss.getSheetByName("Settings");
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet("Settings");
    settingsSheet.appendRow(["Key", "Value"]);
    var defaultSettings = [
      ["Total Seats", "4000"],
      ["Event Name", "Buddhist Overnight Dhamma Program"],
      ["Venue", "Dhamma Hall Auditorium"],
      ["Date", "2026-07-15"],
      ["Admin Username", "admin"],
      ["Admin Password", "Dhamma2026"]
    ];
    for (var i = 0; i < defaultSettings.length; i++) {
      settingsSheet.appendRow(defaultSettings[i]);
    }
  }

  // 2. Setup Registrations sheet
  var regSheet = ss.getSheetByName("Registrations");
  if (!regSheet) {
    regSheet = ss.insertSheet("Registrations");
    regSheet.appendRow([
      "Registration ID", 
      "Full Name", 
      "NIC", 
      "Phone Number", 
      "WhatsApp Number", 
      "District", 
      "Seat Number", 
      "QR Code", 
      "Status", 
      "Registered Date", 
      "Checked In Time"
    ]);
  }

  // 3. Setup Seats sheet
  var seatsSheet = ss.getSheetByName("Seats");
  if (!seatsSheet) {
    seatsSheet = ss.insertSheet("Seats");
    seatsSheet.appendRow(["Seat Number", "Status", "Registration ID"]);
    
    // Generate 4000 seats in bulk (Blocks A to T, 20 blocks, each having 200 seats)
    var seatRows = [];
    var blocks = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T"];
    
    for (var b = 0; b < blocks.length; b++) {
      var blockName = blocks[b];
      for (var s = 1; s <= 200; s++) {
        var seatNum = blockName + String(s).padStart(3, '0');
        seatRows.push([seatNum, "Available", ""]);
      }
    }
    
    // Write in chunks to prevent gas execution timeouts (1000 rows at a time)
    var chunkSize = 1000;
    for (var i = 0; i < seatRows.length; i += chunkSize) {
      var chunk = seatRows.slice(i, i + chunkSize);
      seatsSheet.getRange(i + 2, 1, chunk.length, 3).setValues(chunk);
    }
  }
}

// Get setting value by key
function getSetting(key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Settings");
  if (!sheet) return "";
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString().trim().toLowerCase() === key.toString().trim().toLowerCase()) {
      return data[i][1];
    }
  }
  return "";
}

// Save setting value
function saveSetting(key, value) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Settings");
  if (!sheet) return false;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString().trim().toLowerCase() === key.toString().trim().toLowerCase()) {
      sheet.getRange(i + 1, 2).setValue(value);
      return true;
    }
  }
  sheet.appendRow([key, value]);
  return true;
}

// Authenticate Admin
function authenticateAdmin(username, password) {
  var dbUsername = getSetting("Admin Username") || "admin";
  var dbPassword = getSetting("Admin Password") || "Dhamma2026";
  var valid = (username === dbUsername && password === dbPassword);
  appendLogRow('Admin Login Attempt', valid ? 'Successful login' : 'Failed login attempt', username);
  return valid;
}

// Fetch dashboard stats
function getDashboardStats() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var regsSheet = ss.getSheetByName("Registrations");
  
  if (!regsSheet) {
    initDatabase();
    regsSheet = ss.getSheetByName("Registrations");
  }
  
  var regsData = regsSheet.getDataRange().getValues();
  
  var totalCapacity = parseInt(getSetting("Total Seats") || "4000");
  var totalRegistered = regsData.length - 1;
  var checkedIn = 0;
  var reserved = 0;
  
  for (var i = 1; i < regsData.length; i++) {
    var status = regsData[i][8];
    if (status === "Checked In") checkedIn++;
    else if (status === "Reserved") reserved++;
  }
  
  var availableSlots = Math.max(0, totalCapacity - totalRegistered);
  
  // Calculate today's registrations
  var today = new Date().toDateString();
  var todayRegCount = 0;
  for (var j = 1; j < regsData.length; j++) {
    var regDate = new Date(regsData[j][9]);
    if (regDate.toDateString() === today) {
      todayRegCount++;
    }
  }
  
  // Fetch latest 10 registrations
  var latestRegs = [];
  var start = Math.max(1, regsData.length - 10);
  for (var k = regsData.length - 1; k >= start; k--) {
    latestRegs.push({
      id: regsData[k][0],
      name: regsData[k][1],
      nic: regsData[k][2],
      phone: regsData[k][3],
      whatsapp: regsData[k][4],
      district: regsData[k][5],
      seat: regsData[k][6] || "N/A",
      status: regsData[k][8],
      date: new Date(regsData[k][9]).toLocaleDateString()
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

// Register new user
function saveNewRegistration(regData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Registrations");
  if (!sheet) {
    initDatabase();
    sheet = ss.getSheetByName("Registrations");
  }
  
  var data = sheet.getDataRange().getValues();
  var inputName = regData.fullName.toString().trim().toLowerCase();
  var inputNic = regData.nic.toString().trim().toLowerCase();
  
  for (var i = 1; i < data.length; i++) {
    var existingName = data[i][1].toString().trim().toLowerCase();
    var existingNic = data[i][2].toString().trim().toLowerCase();
    
    if (existingName === inputName || existingNic === inputNic) {
      return {
        success: false,
        alreadyRegistered: true,
        message: "Already Registered",
        registrant: {
          id: data[i][0],
          name: data[i][1],
          nic: data[i][2],
          phone: data[i][3],
          whatsapp: data[i][4],
          district: data[i][5],
          status: data[i][8],
          qrCode: data[i][7]
        }
      };
    }
  }
  
  var totalCapacity = parseInt(getSetting("Total Seats") || "4000");
  var totalRegistered = data.length - 1;
  if (totalRegistered >= totalCapacity) {
    return {
      success: false,
      message: "Registration Limit Reached! Maximum capacity of " + totalCapacity + " registrants has been filled."
    };
  }
  
  // Generate next Registration ID (ATK-XXXX)
  var lastRow = sheet.getLastRow();
  var nextNum = 1;
  if (lastRow > 1) {
    var lastId = sheet.getRange(lastRow, 1).getValue().toString();
    var match = lastId.match(/ATK-(\d+)/);
    if (match) {
      nextNum = parseInt(match[1]) + 1;
    }
  }
  var regId = "ATK-" + String(nextNum).padStart(4, '0');
  
  var qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=" + encodeURIComponent(JSON.stringify({ id: regId }));
  var today = new Date();
  
  sheet.appendRow([
    regId,
    regData.fullName,
    regData.nic,
    regData.phone,
    regData.whatsapp,
    regData.district,
    "N/A", // Seat Number N/A
    qrUrl, // QR Code
    "Reserved", // Default Status
    today,
    "" // Checked In Time
  ]);
  
  appendLogRow('New Registration', 'Reg ID: ' + regId + ' | Name: ' + regData.name, 'System');

  return {
    success: true,
    registrationId: regId,
    qrUrl: qrUrl
  };
}

// Search registrations
function searchRegistrations(query) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Registrations");
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  var results = [];
  var q = query.toString().toLowerCase().trim();
  
  for (var i = 1; i < data.length; i++) {
    var regId = data[i][0].toString().toLowerCase();
    var name = data[i][1].toString().toLowerCase();
    var nic = data[i][2].toString().toLowerCase();
    var phone = data[i][3].toString().toLowerCase();
    var seat = data[i][6].toString().toLowerCase();
    
    if (regId.indexOf(q) !== -1 || 
        name.indexOf(q) !== -1 || 
        nic.indexOf(q) !== -1 || 
        phone.indexOf(q) !== -1 || 
        seat.indexOf(q) !== -1) {
      results.push({
        id: data[i][0],
        name: data[i][1],
        nic: data[i][2],
        phone: data[i][3],
        whatsapp: data[i][4],
        district: data[i][5],
        seat: data[i][6],
        qrCode: data[i][7],
        status: data[i][8],
        date: new Date(data[i][9]).toLocaleDateString(),
        checkedInTime: data[i][10] ? new Date(data[i][10]).toLocaleString() : ""
      });
    }
  }
  return results;
}

// ==========================================
// SEAT MANAGEMENT OPERATIONS
// ==========================================

// Fetch seats by block (e.g., "A", "B", etc.)
function fetchSeatsByBlock(blockName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Seats");
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  var seats = [];
  var block = blockName.toString().toUpperCase().trim();
  
  for (var i = 1; i < data.length; i++) {
    var seatNum = data[i][0].toString();
    if (seatNum.indexOf(block) === 0) {
      seats.push({
        seatNumber: seatNum,
        status: data[i][1],
        registrationId: data[i][2]
      });
    }
  }
  return seats;
}

// Assign seat transactional method
function assignSeat(registrationId, seatNumber) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return {
      success: false,
      message: "The server is currently busy. Please try again."
    };
  }
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var seatsSheet = ss.getSheetByName("Seats");
    var regsSheet = ss.getSheetByName("Registrations");
    
    if (!seatsSheet || !regsSheet) {
      return { success: false, message: "Database tables missing." };
    }
    
    // Verify if seat is available
    var seatsData = seatsSheet.getDataRange().getValues();
    var seatRowIdx = -1;
    var isAvailable = false;
    
    for (var i = 1; i < seatsData.length; i++) {
      if (seatsData[i][0].toString() === seatNumber) {
        seatRowIdx = i + 1;
        isAvailable = (seatsData[i][1] === "Available");
        break;
      }
    }
    
    if (seatRowIdx === -1) {
      return { success: false, message: "Seat number " + seatNumber + " does not exist." };
    }
    if (!isAvailable) {
      return { success: false, message: "Seat " + seatNumber + " is already booked." };
    }
    
    // Check registration ID
    var regsData = regsSheet.getDataRange().getValues();
    var regRowIdx = -1;
    
    for (var j = 1; j < regsData.length; j++) {
      if (regsData[j][0].toString() === registrationId) {
        regRowIdx = j + 1;
        var existingSeat = regsData[j][6];
        if (existingSeat) {
          return { success: false, message: "This registrant already has seat " + existingSeat + " assigned." };
        }
        break;
      }
    }
    
    if (regRowIdx === -1) {
      return { success: false, message: "Registration ID " + registrationId + " not found." };
    }
    
    // Update Seats Sheet
    seatsSheet.getRange(seatRowIdx, 2).setValue("Reserved");
    seatsSheet.getRange(seatRowIdx, 3).setValue(registrationId);
    
    // Generate QR code URL
    var qrUrl = generateQRCodeUrl(registrationId, seatNumber);
    
    // Update Registrations Sheet
    regsSheet.getRange(regRowIdx, 7).setValue(seatNumber);
    regsSheet.getRange(regRowIdx, 8).setValue(qrUrl);
    regsSheet.getRange(regRowIdx, 9).setValue("Reserved");
    
    return {
      success: true,
      registrationId: registrationId,
      seatNumber: seatNumber,
      qrUrl: qrUrl
    };
    
  } catch (error) {
    return { success: false, message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// QR CODE GENERATION Helper
// ==========================================

function generateQRCodeUrl(registrationId, seatNumber) {
  var qrData = JSON.stringify({
    id: registrationId,
    seat: seatNumber
  });
  return "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=" + encodeURIComponent(qrData);
}

// ==========================================
// SCANNER CHECK-IN Operations
// ==========================================

function verifyAndCheckIn(registrationId) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return {
      success: false,
      message: "Server busy. Please try verifying again."
    };
  }
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var regsSheet = ss.getSheetByName("Registrations");
    var seatsSheet = ss.getSheetByName("Seats");
    
    if (!regsSheet || !seatsSheet) {
      return { success: false, message: "Database tables missing." };
    }
    
    var regsData = regsSheet.getDataRange().getValues();
    var regRowIdx = -1;
    var currentReg = null;
    
    for (var i = 1; i < regsData.length; i++) {
      if (regsData[i][0].toString() === registrationId) {
        regRowIdx = i + 1;
        currentReg = {
          id: regsData[i][0],
          name: regsData[i][1],
          phone: regsData[i][3],
          district: regsData[i][5],
          seat: regsData[i][6],
          status: regsData[i][8],
          checkedInTime: regsData[i][10]
        };
        break;
      }
    }
    
    if (regRowIdx === -1) {
      return { success: false, message: "Invalid Registration Code: " + registrationId };
    }
    
    if (currentReg.status === "Checked In") {
      var prevTime = currentReg.checkedInTime ? new Date(currentReg.checkedInTime).toLocaleString() : "Unknown";
      return {
        success: false,
        alreadyCheckedIn: true,
        message: "Already Checked In",
        previousTime: prevTime,
        data: currentReg
      };
    }
    
    if (!currentReg.seat) {
      return {
        success: false,
        message: "Registrant has not selected a seat yet.",
        data: currentReg
      };
    }
    
    var checkInTime = new Date();
    
    // Update Registrations sheet
    regsSheet.getRange(regRowIdx, 9).setValue("Checked In");
    regsSheet.getRange(regRowIdx, 11).setValue(checkInTime);
    
    // Update Seats sheet
    var seatsData = seatsSheet.getDataRange().getValues();
    var seatRowIdx = -1;
    for (var j = 1; j < seatsData.length; j++) {
      if (seatsData[j][0].toString() === currentReg.seat) {
        seatRowIdx = j + 1;
        break;
      }
    }
    
    if (seatRowIdx !== -1) {
      seatsSheet.getRange(seatRowIdx, 2).setValue("Checked In");
    }
    
    currentReg.status = "Checked In";
    currentReg.checkedInTime = checkInTime.toLocaleString();
    
    appendLogRow('QR Check-in', 'Reg ID: ' + registrationId + ' | Name: ' + currentReg.name, 'QR Scanner');
    
    return {
      success: true,
      message: "Check-in Successful!",
      data: currentReg
    };
    
  } catch (error) {
    return { success: false, message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

// Update Registration Details manually
function updateRegistration(regId, updatedData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Registrations");
  if (!sheet) return { success: false, message: "Sheet not found" };
  
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === regId) {
      // Columns: ID, Name, NIC, Phone, Whatsapp, District, Seat Number, QR Code, Status, Registered Date, Checked In Time
      sheet.getRange(i + 1, 2).setValue(updatedData.name);
      sheet.getRange(i + 1, 3).setValue(updatedData.nic);
      sheet.getRange(i + 1, 4).setValue(updatedData.phone);
      sheet.getRange(i + 1, 5).setValue(updatedData.whatsapp || updatedData.phone);
      sheet.getRange(i + 1, 6).setValue(updatedData.district);
      sheet.getRange(i + 1, 9).setValue(updatedData.status); // 9th column is Status (since 7 is Seat Number, 8 is QR Code)
      
      if (updatedData.status === "Checked In") {
        if (!data[i][10]) {
          sheet.getRange(i + 1, 11).setValue(new Date()); // 11th column is Checked In Time
        }
      } else {
        sheet.getRange(i + 1, 11).setValue("");
      }
      appendLogRow('Update Registration', 'Reg ID: ' + regId + ' | Name: ' + updatedData.name, 'Admin');
      return { success: true, message: "Registration updated successfully!" };
    }
  }
  return { success: false, message: "Registration code not found: " + regId };
}

// Delete Registration manually
function deleteRegistration(regId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var regSheet = ss.getSheetByName("Registrations");
  if (!regSheet) return { success: false, message: "Registrations sheet not found" };
  
  var data = regSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === regId) {
      var deletedName = data[i][1];
      var deletedPhone = data[i][3];
      regSheet.deleteRow(i + 1);
      
      // Free up the seat if one was assigned
      var seatsSheet = ss.getSheetByName("Seats");
      if (seatsSheet) {
        var seatsData = seatsSheet.getDataRange().getValues();
        for (var j = 1; j < seatsData.length; j++) {
          if (seatsData[j][2] === regId) {
            seatsSheet.getRange(j + 1, 2).setValue("Available");
            seatsSheet.getRange(j + 1, 3).setValue("");
            break;
          }
        }
      }
      
      appendLogRow('Delete Registration', 'Reg ID: ' + regId + ' | Name: ' + deletedName + ' | Phone: ' + deletedPhone, 'Admin');
      return { success: true, message: "Registration deleted successfully." };
    }
  }
  return { success: false, message: "Registration not found: " + regId };
}

// Append an audit log to the Audit Logs sheet
function appendLogRow(action, details, user) {
  if (!user) user = 'System';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Audit Logs");
  if (!sheet) {
    sheet = ss.insertSheet("Audit Logs");
    sheet.appendRow(['Timestamp', 'Action', 'Details', 'User/Source']);
  }
  
  var timestamp = new Date().toLocaleString();
  sheet.appendRow([timestamp, action, details, user]);
}
