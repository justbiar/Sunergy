const fs = require('fs');
const zlib = require('zlib');

const html = fs.readFileSync('/Users/biar/Desktop/Sunergy/Sunergy-standalone.html', 'utf8');
const manifestMatch = html.match(/<script type="__bundler\/manifest">\s*(\{[\s\S]*?\})\s*<\/script>/);

if (!fs.existsSync('/Users/biar/Desktop/Sunergy/extracted')) {
  fs.mkdirSync('/Users/biar/Desktop/Sunergy/extracted');
}

if (manifestMatch) {
  const manifest = JSON.parse(manifestMatch[1]);
  for (const key in manifest) {
    if (manifest[key].mime === 'application/javascript' || manifest[key].mime === 'text/jsx' || manifest[key].mime === 'text/babel') {
      const b64 = manifest[key].data;
      const buf = Buffer.from(b64, 'base64');
      try {
        const decompressed = manifest[key].compressed ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
        fs.writeFileSync(`/Users/biar/Desktop/Sunergy/extracted/${key}.js`, decompressed);
      } catch (e) {
        console.error('Error decompressing ' + key, e);
      }
    }
  }
  console.log('Extracted scripts to /Users/biar/Desktop/Sunergy/extracted/');
} else {
  console.log('Manifest not found');
}
