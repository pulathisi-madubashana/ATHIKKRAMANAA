const { Jimp } = require('jimp');
const path = require('path');
const QRCode = require('qrcode');
const auth = require('./auth');

async function generateTicketBuffer(regId) {
    try {
        // 1. Generate QR Code Buffer
        const sig = auth.generateQRSig(regId);
        const qrText = JSON.stringify({ id: regId, sig: sig });
        const qrBuffer = await QRCode.toBuffer(qrText, { 
            width: 1400, // Make it large to fit the 1877x2653 white box
            margin: 2, 
            color: { dark: '#000000', light: '#ffffff' } 
        });

        // 2. Load Template
        const templatePath = path.join(__dirname, 'public', 'ticket_template.png');
        const templateImage = await Jimp.read(templatePath);
        const qrImage = await Jimp.read(qrBuffer);

        // 3. Composite QR onto Template
        const x = Math.floor((templateImage.bitmap.width - qrImage.bitmap.width) / 2);
        
        // White box is from Y=116 to Y=2769. Center is (116+2769)/2 = 1442.
        // We want to center the QR code at Y=1442.
        const y = Math.floor(1442 - (qrImage.bitmap.height / 2));
        
        templateImage.composite(qrImage, x, y);

        // 4. Return the buffer
        return await templateImage.getBuffer('image/png');
    } catch (err) {
        console.error('Error generating ticket buffer:', err);
        return null;
    }
}

module.exports = { generateTicketBuffer };
