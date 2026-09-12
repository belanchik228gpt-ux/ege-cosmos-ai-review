// Opens the real Cosmos profile and its explicit official sign-in action.
// Does not read credentials or print login URLs/tokens. The user completes browser sign-in.
import { _electron as electron } from 'playwright';
import path from 'node:path';
const app = await electron.launch({
  executablePath: path.resolve('node_modules/electron/dist/electron.exe'),
  args: [path.resolve('.')],
  env: process.env,
  timeout: 45000,
});
const page = await app.firstWindow();
page.setDefaultTimeout(20000);
await page.locator('.cosmos-studio').waitFor();
await page.locator('.studio-connection-pill').click();
await page.getByRole('dialog', { name: 'Преподаватель с OpenAI' }).waitFor();
let status = await page.evaluate(() => window.cosmos.getOpenAIStatus());
if (status.authenticated !== true) {
  await page.getByRole('button', { name: 'Войти через ChatGPT', exact: true }).click();
  console.log('Official browser sign-in opened for the real Cosmos profile. No credentials read.');
} else console.log('Cosmos account is already connected.');
const deadline = Date.now() + 30 * 60 * 1000;
while (Date.now() < deadline) {
  status = await page.evaluate(() => window.cosmos.getOpenAIStatus()).catch(() => null);
  if (status?.authenticated === true) {
    console.log('AUTHENTICATED: Cosmos session connected.');
    break;
  }
  if (!status) break;
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
await app.close();
