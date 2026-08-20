const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/root/.cache/puppeteer/chrome/linux-152.0.7977.42/chrome-linux64/chrome', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await browser.close();
})();
