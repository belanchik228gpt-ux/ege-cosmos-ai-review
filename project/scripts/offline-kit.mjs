import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
const root = process.cwd();
const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const release = path.join(root, 'release'),
  kit = path.join(release, 'offline-kit');
await fs.mkdir(path.join(kit, 'Cosmos-Models'), { recursive: true });
const filename = 'Qwen3-8B-Q4_K_M.gguf';
const model = path.join(root, 'runtime/models', filename);
// A hard link is a complete regular file on NTFS, not a symbolic path dependency.
// It avoids copying immutable multi-GB weights repeatedly on the development disk.
// Cross-volume kits fall back to a real copy. Never remove a path outside release.
async function materialize(source, destination) {
  const resolved = path.resolve(destination);
  if (!resolved.startsWith(path.resolve(release) + path.sep)) throw new Error('Unsafe output path');
  const sourceInfo = await fs.stat(source);
  const existing = await fs.stat(resolved).catch(() => null);
  if (existing && existing.ino === sourceInfo.ino && existing.dev === sourceInfo.dev) return;
  if (existing) {
    if (!existing.isFile()) throw new Error('Output is not a regular file');
    await fs.unlink(resolved);
  }
  try {
    await fs.link(source, resolved);
  } catch {
    await fs.copyFile(source, resolved);
  }
  if ((await fs.stat(resolved)).size !== sourceInfo.size) throw new Error('Incomplete output');
}
async function verifyArtifact(file, expected) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if ((await fs.stat(file)).size !== expected.bytes || hash.digest('hex') !== expected.sha256)
    throw new Error(`Unverified artifact: ${path.basename(file)}`);
}
const vision = JSON.parse(
  await fs.readFile(path.join(root, 'runtime/vision-artifacts.json'), 'utf8'),
);
const visionNames = ['Qwen3VL-4B-Instruct-Q4_K_M.gguf', 'mmproj-Qwen3VL-4B-Instruct-F16.gguf'];
if (
  vision.repository !== 'Qwen/Qwen3-VL-4B-Instruct-GGUF' ||
  vision.files?.length !== 2 ||
  !visionNames.every((name) =>
    vision.files.some((file) => file.file === name && file.relative === `models/vision/${name}`),
  )
)
  throw new Error('Unexpected vision manifest');
for (const artifact of vision.files)
  await verifyArtifact(path.join(root, 'runtime', artifact.relative), artifact);
const installers = (await fs.readdir(release)).filter(
  (f) => f === `EGE Cosmos Setup ${version}.exe`,
);
if (!installers.length) throw new Error('Installer not built');
for (const file of installers) await materialize(path.join(release, file), path.join(kit, file));
await materialize(model, path.join(kit, 'Cosmos-Models', filename));
const portableModels = path.join(release, 'win-unpacked/resources/runtime/models');
await fs.mkdir(portableModels, { recursive: true });
await materialize(model, path.join(portableModels, filename));
await fs.mkdir(path.join(kit, 'Cosmos-Models/vision'), { recursive: true });
await fs.mkdir(path.join(portableModels, 'vision'), { recursive: true });
for (const artifact of vision.files) {
  const source = path.join(root, 'runtime', artifact.relative);
  await materialize(source, path.join(kit, 'Cosmos-Models/vision', artifact.file));
  await materialize(source, path.join(portableModels, 'vision', artifact.file));
}
await fs.copyFile('runtime/artifacts.json', path.join(kit, 'MODEL-SOURCES.json'));
await fs.copyFile('runtime/vision-artifacts.json', path.join(kit, 'VISION-SOURCES.json'));
await fs.writeFile(
  path.join(kit, 'ПРОЧИТАЙ МЕНЯ.txt'),
  `EGE Cosmos ${version} — комплект для установки без интернета\n\n1. Оставь установщик EGE Cosmos Setup ${version}.exe и папку Cosmos-Models рядом друг с другом. Сохрани вложенную папку vision с обоими файлами.\n2. Запусти установщик. Он установит приложение, официальный OpenAI runtime, локальную текстовую модель и отдельную модель чтения фото.\n3. Открой EGE Cosmos с рабочего стола. Для основного преподавателя OpenAI войди в ChatGPT через кнопку в приложении и подключись к интернету. Вход выполняется один раз, сессия сохраняется штатным механизмом OpenAI; повторный вход потребуется, если сессия отозвана или больше не действует. Доступность моделей и лимиты зависят от аккаунта. Отдельно запускать ChatGPT или служебные процессы не нужно.\n\nБез аккаунта и интернета доступны локальная практика, учебные сцены, память, план и документы. Дополнительная локальная Qwen работает на этом компьютере и имеет ограничения качества; это отдельная возможность, а не ответ OpenAI. Установка из этого комплекта возможна офлайн, но основному преподавателю OpenAI для ответов нужен интернет.\n\nВес трёх файлов локальных моделей — около 8,36 ГБ. Они устанавливаются автоматически из Cosmos-Models. Если перенести только exe, приложение и OpenAI runtime установятся, но локальные модели потребуют полного комплекта. Не удаляй mmproj: это необходимая часть локального чтения фото.\n\nЛокальная модель чтения фото работает без аккаунта. Перед отправкой распознанного условия проверь числа, знаки и единицы. Печатные контрольные изображения проверены; качество почерка, сложных чертежей и снимков тетрадей не гарантируется. Локальная текстовая модель и локальное чтение фото запускаются по очереди, чтобы экономить видеопамять. При прикреплении фото к разговору OpenAI оно передаётся OpenAI вместе с запросом и требует интернета.\n\nПамять: %APPDATA%\\EGE Cosmos Studio\nДокументы: папка Документы\\EGE Cosmos\n\nЭто тестовая учебная система. Каталог официальных материалов и авторские готовые уроки отмечены отдельно; каталог не означает полностью готовый курс. План и отчёты сохраняются локально. Исходный TON618 из Unreal ещё не подключён. Полностью офлайн-распознавание речи пока отсутствует.\n`,
  'utf8',
);
console.log('Offline installer kit and portable text/vision models prepared.');
