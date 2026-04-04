const fs = require('fs');
const path = require('path');

const API_KEY = process.env.NPS_API_KEY || process.env.EXPO_PUBLIC_NPS_API_KEY;
if (!API_KEY) {
  console.error('Set NPS_API_KEY or EXPO_PUBLIC_NPS_API_KEY environment variable');
  process.exit(1);
}

const TEMPLATE = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
const OUT_DIR = path.join(__dirname, 'generated');

async function fetchParks() {
  const url = `https://developer.nps.gov/api/v1/parks?limit=500&api_key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.data;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function generatePage(park) {
  const activities = (park.activities || []).map(a => `<li>${a.name}</li>`).join('\n');
  const phone = park.contacts?.phoneNumbers?.[0]?.phoneNumber || 'See website';
  const email = park.contacts?.emailAddresses?.[0]?.emailAddress || '';

  return TEMPLATE
    .replace(/\{\{PARK_NAME\}\}/g, park.fullName)
    .replace('{{PARK_DESIGNATION}}', park.designation || 'National Park')
    .replace('{{PARK_STATE}}', park.states)
    .replace('{{PARK_DESCRIPTION}}', park.description)
    .replace('{{ACTIVITIES_LIST}}', activities)
    .replace('{{DIRECTIONS}}', park.directionsInfo || 'See NPS website for directions.')
    .replace('{{PHONE}}', phone)
    .replace('{{EMAIL}}', email);
}

function generateIndex(parks) {
  const links = parks
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map(p => `<li><a href="${slugify(p.fullName)}.html">${p.fullName}</a> — ${p.states}</li>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>All National Parks — NatureFind</title>
  <meta name="description" content="Explore 400+ national parks with trails, campgrounds, weather, and trip planning.">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <a href="../index.html" class="logo">NatureFind</a>
    <a href="https://apps.apple.com/app/naturefind/id6759922299" class="cta-button">Download App</a>
  </header>
  <main>
    <h1>All National Parks</h1>
    <p>${parks.length} parks and sites across the United States.</p>
    <ul class="park-list" style="margin-top:24px;">${links}</ul>
    <section class="app-cta" style="margin-top:40px;">
      <h2>Explore Every Park with NatureFind</h2>
      <p>Interactive maps, AI trip planning, trail conditions, and campground details.</p>
      <a href="https://apps.apple.com/app/naturefind/id6759922299" class="cta-button large">Download Free</a>
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('Fetching parks from NPS API...');
  const parks = await fetchParks();
  console.log(`Got ${parks.length} parks. Generating pages...`);

  for (const park of parks) {
    const html = generatePage(park);
    const filename = `${slugify(park.fullName)}.html`;
    fs.writeFileSync(path.join(OUT_DIR, filename), html);
  }

  const indexHtml = generateIndex(parks);
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), indexHtml);
  fs.copyFileSync(path.join(__dirname, 'style.css'), path.join(OUT_DIR, 'style.css'));
  console.log(`Generated ${parks.length} park pages + index in ${OUT_DIR}/`);
}

main().catch(console.error);
