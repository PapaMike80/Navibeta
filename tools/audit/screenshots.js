// Uso: node screenshots.js [etichetta]   (es. "prima" o "dopo"; default "corrente")
// Salva in ../screenshots/<etichetta>/<profilo>-<pagina>.png. Solo lettura: blocca ogni richiesta non GET.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const { BASE, PAGES, PROFILES } = require('./pages');
const label = process.argv[2] || 'corrente';
const out = path.join(__dirname, '..', 'screenshots', label);
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  for (const [profile, device] of Object.entries(PROFILES)) {
    const ctx = await browser.newContext(device ? devices[device] : { viewport: { width: 1440, height: 900 } });
    await ctx.route('**/*', r => (['GET', 'HEAD'].includes(r.request().method()) ? r.continue() : r.abort()));
    for (const [name, file] of PAGES) {
      const page = await ctx.newPage();
      try {
        await page.goto(BASE + file, { waitUntil: 'networkidle', timeout: 30000 });
        await page.screenshot({ path: path.join(out, `${profile}-${name}.png`), fullPage: true });
        console.log('ok', profile, name);
      } catch (e) { console.log('ERR', profile, name, e.message.split('\n')[0]); }
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
})();
