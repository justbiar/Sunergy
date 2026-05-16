const fs = require('fs');
const zlib = require('zlib');

const html = fs.readFileSync('/Users/biar/Desktop/Sunergy/Sunergy-standalone.html', 'utf8');
const manifestMatch = html.match(/<script type="__bundler\/manifest">\s*(\{[\s\S]*?\})\s*<\/script>/);

if (manifestMatch) {
  const manifest = JSON.parse(manifestMatch[1]);
  for (const key in manifest) {
    if (manifest[key].mime === 'text/jsx') {
      const b64 = manifest[key].data;
      const buf = Buffer.from(b64, 'base64');
      const decompressed = zlib.gunzipSync(buf).toString('utf8');
      fs.writeFileSync('/Users/biar/Desktop/Sunergy/extracted.jsx', decompressed);
      console.log('Extracted text/jsx to extracted.jsx');
    }
  }
} else {
  console.log('Manifest not found');
}
