// Uso: node audit.js   -> ../audit-report/axe.json, lighthouse-*.json e report.md con i problemi per gravita'.
const { chromium, devices } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const fs = require('fs'), path = require('path');
const { BASE, PAGES } = require('./pages');
const out = path.join(__dirname, '..', 'audit-report');
fs.mkdirSync(out, { recursive: true });
const RANK = { critical: 0, serious: 1, moderate: 2, minor: 3 };
(async () => {
  const lighthouse = (await import('lighthouse')).default;
  const browser = await chromium.launch({ args: ['--remote-debugging-port=9222'] });
  const ctx = await browser.newContext(devices['Pixel 7']);
  await ctx.route('**/*', r => (['GET', 'HEAD'].includes(r.request().method()) ? r.continue() : r.abort()));
  const axeRows = [], lhRows = [];
  for (const [name, file] of PAGES) {
    const url = BASE + file;
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    try {
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'best-practice']).analyze();
      for (const v of res.violations) axeRows.push({ page: name, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes[0] && v.nodes[0].target.join(' ') });
    } catch (e) { console.log('axe ERR', name, e.message); }
    await page.close();
    try {
      const r = await lighthouse(url, { port: 9222, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'pwa', 'seo'].filter(c => c !== 'pwa') });
      const c = r.lhr.categories;
      lhRows.push({ page: name, perf: Math.round(c.performance.score * 100), a11y: Math.round(c.accessibility.score * 100), best: Math.round(c['best-practices'].score * 100),
        lcp: r.lhr.audits['largest-contentful-paint'].displayValue, tbt: r.lhr.audits['total-blocking-time'].displayValue, cls: r.lhr.audits['cumulative-layout-shift'].displayValue });
    } catch (e) { console.log('lh ERR', name, e.message.split('\n')[0]); }
    console.log('fatto', name);
  }
  await browser.close();
  axeRows.sort((a, b) => RANK[a.impact] - RANK[b.impact] || b.nodes - a.nodes);
  fs.writeFileSync(path.join(out, 'axe.json'), JSON.stringify(axeRows, null, 1));
  fs.writeFileSync(path.join(out, 'lighthouse.json'), JSON.stringify(lhRows, null, 1));
  let md = '# Report verifica\n\n## Lighthouse (mobile Pixel 7)\n\n| Pagina | Prestazioni | Accessibilita | Best practice | LCP | TBT | CLS |\n|---|---|---|---|---|---|---|\n';
  for (const r of lhRows) md += `| ${r.page} | ${r.perf} | ${r.a11y} | ${r.best} | ${r.lcp} | ${r.tbt} | ${r.cls} |\n`;
  md += '\n## axe (per gravita\')\n\n| Gravita | Pagina | Regola | Elementi | Esempio |\n|---|---|---|---|---|\n';
  for (const r of axeRows) md += `| ${r.impact} | ${r.page} | ${r.id}: ${r.help} | ${r.nodes} | \`${r.sample || ''}\` |\n`;
  fs.writeFileSync(path.join(out, 'report.md'), md);
})();
