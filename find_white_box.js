const { Jimp } = require('jimp');
const path = require('path');

async function findWhiteBox() {
  const templatePath = path.join(__dirname, 'public', 'ticket_template.png');
  const img = await Jimp.read(templatePath);
  
  let minX = img.bitmap.width;
  let maxX = 0;
  let minY = img.bitmap.height;
  let maxY = 0;
  
  for (let y = 0; y < img.bitmap.height; y++) {
    for (let x = 0; x < img.bitmap.width; x++) {
      const color = Jimp.intToRGBA(img.getPixelColor(x, y));
      // check if it's very white
      if (color.r > 250 && color.g > 250 && color.b > 250) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  
  console.log(`White box bounds: minX=${minX}, maxX=${maxX}, minY=${minY}, maxY=${maxY}`);
  console.log(`Width=${maxX - minX}, Height=${maxY - minY}`);
}

findWhiteBox();
