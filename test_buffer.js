const { Jimp } = require('jimp');
const path = require('path');
const QRCode = require('qrcode');

async function testBuffer() {
  try {
    const qrText = JSON.stringify({ id: "ATK-0001" });
    const qrBuffer = await QRCode.toBuffer(qrText, { width: 450, margin: 2 });

    const templatePath = path.join(__dirname, 'public', 'ticket_template.png');
    const templateImage = await Jimp.read(templatePath);
    const qrImage = await Jimp.read(qrBuffer);
    
    const x = Math.floor((templateImage.bitmap.width - qrImage.bitmap.width) / 2);
    const y = 280; 

    templateImage.composite(qrImage, x, y);

    const finalBuffer = await templateImage.getBuffer('image/png');
    console.log('Buffer length:', finalBuffer.length);
  } catch (e) {
    console.error('Error:', e);
  }
}

testBuffer();
