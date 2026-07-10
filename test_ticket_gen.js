const { Jimp } = require('jimp');
const path = require('path');
const QRCode = require('qrcode');

async function testGenerate() {
  try {
    const qrText = JSON.stringify({ id: "ATK-0001" });
    const qrBuffer = await QRCode.toBuffer(qrText, {
      width: 450,
      margin: 2
    });

    const templatePath = path.join(__dirname, 'public', 'ticket_template.png');
    console.log('Loading template from:', templatePath);
    const templateImage = await Jimp.read(templatePath);
    const qrImage = await Jimp.read(qrBuffer);
    
    // The template is 682x1024.
    // White space starts around Y=200 and ends around Y=800.
    // Let's place it at X=(682-450)/2 = 116, Y=300
    const x = Math.floor((templateImage.bitmap.width - qrImage.bitmap.width) / 2);
    const y = 280; // A good estimate for center of the white box

    templateImage.composite(qrImage, x, y);

    templateImage.write(path.join(__dirname, 'public', 'test_ticket.png'));
    console.log('Ticket generated at public/test_ticket.png');
  } catch (e) {
    console.error(e);
  }
}

testGenerate();
