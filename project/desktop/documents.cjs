const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { randomBytes } = require('node:crypto');
const { validateSchoolContext } = require('./school-subjects.cjs');
const escape = (value) =>
  String(value)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char],
    );
const segment = (value) =>
  String(value || 'Документ')
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, 95) || 'Документ';
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const locals = [],
    centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const filename = Buffer.from(name),
      data = Buffer.from(content),
      compressed = zlib.deflateRawSync(data),
      crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, filename);
    offset += local.length + filename.length + compressed.length;
  }
  const central = Buffer.concat(centrals),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}
function bodyMarkdown(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const first = lines.findIndex((line) => line.trim());
  // The editable title field is authoritative, including after a title rename.
  if (first >= 0 && /^#\s+/.test(lines[first])) lines.splice(first, 1);
  return lines.join('\n').trim();
}
function plainInline(text) {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
}
function blocks(content) {
  return bodyMarkdown(content)
    .split('\n')
    .flatMap((line) => {
      if (!line.trim() || /^\s*(?:---+|\*\*\*+)\s*$/.test(line)) return [];
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading)
        return [
          { kind: 'heading', level: Math.min(heading[1].length, 3), text: plainInline(heading[2]) },
        ];
      const bullet = line.match(/^\s*[-*]\s+(.+)$/);
      if (bullet) return [{ kind: 'bullet', text: plainInline(bullet[1]) }];
      return [{ kind: 'paragraph', text: plainInline(line) }];
    });
}
function docx(title, content) {
  const paragraph = (line, style = '') =>
    `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}<w:spacing w:after="140"/>${style === 'Title' || style.startsWith('Heading') ? '<w:keepNext/>' : ''}</w:pPr><w:r><w:t xml:space="preserve">${escape(line)}</w:t></w:r></w:p>`;
  return zip({
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'word/styles.xml':
      '<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="240"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:spacing w:before="180"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="24"/></w:rPr></w:style></w:styles>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph(title, 'Title')}${blocks(
      content,
    )
      .map((block) =>
        paragraph(
          (block.kind === 'bullet' ? '• ' : '') + block.text,
          block.kind === 'heading' ? `Heading${Math.max(2, block.level)}` : '',
        ),
      )
      .join(
        '',
      )}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`,
  });
}
const renderer = import('../shared/document-renderer.mjs');
async function documentHtml(title, content, options = {}) {
  return (await renderer).renderDocument({ ...options, title, content });
}
async function bounded(promise, ms, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function exportDocument(input, { documentsDir, BrowserWindow }) {
  if (
    !input ||
    !['txt', 'md', 'html', 'pdf', 'docx'].includes(input.format) ||
    typeof input.content !== 'string' ||
    input.content.length > 1000000
  )
    throw new Error('Invalid document');
  if (input.mode !== undefined && !['ege', 'school'].includes(input.mode))
    throw new Error('Invalid document mode');
  const school = input.mode === 'school' ? validateSchoolContext(input.subject, input.grade) : null;
  const date = new Date(),
    day = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  const directory = school
    ? path.join(documentsDir, 'Школа', segment(school.title), day)
    : path.join(documentsDir, segment(input.subject || 'Общее'), day);
  await fs.mkdir(directory, { recursive: true });
  const title = String(input.title || 'Документ')
      .trim()
      .slice(0, 500),
    file = path.join(
      directory,
      `${segment(title)}-${date.toTimeString().slice(0, 8).replaceAll(':', '')}-${randomBytes(2).toString('hex')}.${input.format}`,
    );
  let buffer;
  if (input.format === 'pdf') {
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: false,
      },
    });
    try {
      const html = await documentHtml(title, input.content, input);
      await bounded(
        printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)),
        15000,
        'PDF load timeout',
      );
      buffer = await bounded(
        printWindow.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          landscape: true,
          preferCSSPageSize: true,
          displayHeaderFooter: false,
        }),
        20000,
        'PDF render timeout',
      );
    } finally {
      printWindow.destroy();
    }
  } else if (input.format === 'docx') buffer = docx(title, input.content);
  else if (input.format === 'html')
    buffer = Buffer.from(await documentHtml(title, input.content, input));
  else
    buffer = Buffer.from(
      (input.format === 'md' ? '# ' : '') +
        title +
        '\n\n' +
        (input.format === 'md'
          ? bodyMarkdown(input.content)
          : blocks(input.content)
              .map((block) => (block.kind === 'bullet' ? '• ' : '') + block.text)
              .join('\n')),
      'utf8',
    );
  await fs.writeFile(file + '.tmp', buffer, { flag: 'wx' });
  await fs.rename(file + '.tmp', file);
  const stored = await fs.stat(file);
  if (stored.size !== buffer.length || stored.size === 0)
    throw new Error('Document verification failed');
  return { ok: true, path: file };
}
module.exports = { exportDocument, docx, documentHtml, segment, bodyMarkdown, blocks };
