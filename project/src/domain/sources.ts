import type { MaterialStatus, SubjectId } from './types';
import { version as applicationVersion } from '../../package.json';
import { schoolProgrammeSources } from './school-catalog/sources';

export interface LearningSource {
  id: string;
  title: string;
  url: string;
  subjects: SubjectId[];
  checkedAt: string;
  version: string;
  publisher: string;
  status: 'official-reference' | 'primary-reference' | 'local-training';
  note: string;
  role?: 'curriculum' | 'fact' | 'authorship';
  publicationStatus?: 'final' | 'draft' | 'reference' | 'authored';
  verification?: 'publisher-page' | 'document-text' | 'publisher-search-excerpt';
}

const allSubjects: SubjectId[] = ['math', 'russian', 'history', 'social'];

/** Checked publication state, not a prediction about the final 2027 examination. */
export const examMaterialStatus = {
  checkedAt: '2026-09-08',
  finalYear: 2026,
  draftYear: 2027,
  draftDiscussionUntil: '2026-09-30',
  sourceIds: ['fipi-demo', 'fipi-changes-2027-project'],
  summary:
    'Материалы ЕГЭ 2026 опубликованы как утверждённые. Материалы 2027 на дату проверки — проекты; обсуждение открыто до 30 сентября 2026 года. Окончательная структура 2027 здесь не заявлена.',
} as const;

const subjectArchives: { subject: SubjectId; code: string; title: string }[] = [
  { subject: 'math', code: 'ma', title: 'Математика' },
  { subject: 'russian', code: 'ru', title: 'Русский язык' },
  { subject: 'history', code: 'is', title: 'История' },
  { subject: 'social', code: 'ob', title: 'Обществознание' },
];

const fipiArchives: LearningSource[] = subjectArchives.flatMap(({ subject, code, title }) =>
  [2026, 2027].map(
    (year): LearningSource => ({
      id: `fipi-${subject}-${year}${year === 2027 ? '-project' : ''}`,
      title: `ФИПИ · ${title} · ${year}${year === 2027 ? ' · проект' : ''}`,
      url: `https://doc.fipi.ru/ege/demoversii-specifikacii-kodifikatory/${year}/${code}_11_${year}.zip`,
      subjects: [subject],
      checkedAt: '2026-09-08',
      version: `${year} · ${year === 2027 ? 'проект' : 'утверждённый комплект'}`,
      publisher: 'ФГБНУ «ФИПИ»',
      status: 'official-reference',
      role: 'curriculum',
      publicationStatus: year === 2027 ? 'draft' : 'final',
      verification: 'document-text',
      note: 'Архив скачан в память, PDF кодификатора прочитан. Источник состава проверяемого содержания и формата экзамена; это не подтверждение каждого факта карточки и не импорт официальных заданий.',
    }),
  ),
);

type ReferenceInput = Pick<LearningSource, 'id' | 'title' | 'url' | 'subjects' | 'publisher'> &
  Partial<LearningSource>;
function reference(input: ReferenceInput): LearningSource {
  return {
    checkedAt: '2026-09-08',
    version: 'Страница издателя на дату проверки',
    status: 'primary-reference',
    role: 'fact',
    publicationStatus: 'reference',
    verification: 'publisher-page',
    note: 'Источник учебного определения или факта; пример и объяснение Cosmos написаны самостоятельно.',
    ...input,
  };
}

const factualReferences: LearningSource[] = [
  reference({
    id: 'openstax-roots', title: 'OpenStax · Корень из квадрата и модуль',
    url: 'https://openstax.org/books/intermediate-algebra-2e/pages/8-1-simplify-expressions-with-roots',
    subjects: ['math'], publisher: 'OpenStax, Rice University',
    verification: 'publisher-search-excerpt',
    note: 'Проверено правило чётного корня из чётной степени через модуль. Задания и пошаговый урок Cosmos написаны самостоятельно.',
  }),
  reference({
    id: 'openstax-special-products', title: 'OpenStax · Квадрат суммы и разности',
    url: 'https://openstax.org/books/elementary-algebra-2e/pages/6-4-special-products',
    subjects: ['math'], publisher: 'OpenStax, Rice University',
    verification: 'publisher-search-excerpt',
    note: 'Источник правила квадрата двучлена; авторские примеры Cosmos не являются официальными заданиями ФИПИ.',
  }),
  reference({
    id: 'openstax-absolute-value',
    title: 'OpenStax · Модуль числа и уравнения с модулем',
    url: 'https://openstax.org/books/college-algebra-2e/pages/3-6-absolute-value-functions',
    subjects: ['math'],
    publisher: 'OpenStax, Rice University',
    version: 'College Algebra 2e · §3.6 · страница проверена 08.09.2026',
    note: 'Проверены определение модуля действительного числа как расстояния и условия решений уравнения с модулем. Карточка Cosmos написана самостоятельно; текст, упражнения и иллюстрации издателя в неё не импортированы.',
  }),
  reference({
    id: 'openstax-area',
    title: 'OpenStax · Площади прямоугольника и треугольника',
    url: 'https://openstax.org/books/prealgebra-2e/pages/9-4-use-properties-of-rectangles-triangles-and-trapezoids',
    subjects: ['math'],
    publisher: 'OpenStax, Rice University',
    version: 'Prealgebra 2e · §9.4',
  }),
  reference({
    id: 'foxford-median',
    title: 'Фоксфорд · Медиана треугольника',
    url: 'https://foxford.ru/wiki/matematika/mediana',
    subjects: ['math'],
    publisher: 'Фоксфорд',
    note: 'Собственный учебник издателя: определение и свойства медианы. Не материал ФИПИ.',
  }),
  reference({
    id: 'openstax-fraction-add',
    title: 'OpenStax · Сложение дробей',
    url: 'https://openstax.org/books/prealgebra-2e/pages/4-5-add-and-subtract-fractions-with-different-denominators',
    subjects: ['math'],
    publisher: 'OpenStax, Rice University',
    version: 'Prealgebra 2e · §4.5',
  }),
  reference({
    id: 'openstax-fraction-multiply',
    title: 'OpenStax · Умножение дробей',
    url: 'https://openstax.org/books/prealgebra-2e/pages/4-2-multiply-and-divide-fractions',
    subjects: ['math'],
    publisher: 'OpenStax, Rice University',
    version: 'Prealgebra 2e · §4.2',
  }),
  reference({
    id: 'openstax-percent',
    title: 'OpenStax · Проценты',
    url: 'https://openstax.org/books/prealgebra-2e/pages/6-2-solve-general-applications-of-percent',
    subjects: ['math'],
    publisher: 'OpenStax, Rice University',
    version: 'Prealgebra 2e · §6.2',
  }),
  reference({
    id: 'openstax-equation',
    title: 'OpenStax · Линейные уравнения',
    url: 'https://openstax.org/books/elementary-algebra-2e/pages/2-3-solve-equations-with-variables-and-constants-on-both-sides',
    subjects: ['math'],
    publisher: 'OpenStax, Rice University',
    version: 'Elementary Algebra 2e · §2.3',
  }),
  reference({
    id: 'openstax-inequality',
    title: 'OpenStax · Линейные неравенства',
    url: 'https://openstax.org/books/elementary-algebra-2e/pages/2-7-solve-linear-inequalities',
    subjects: ['math'],
    publisher: 'OpenStax, Rice University',
    version: 'Elementary Algebra 2e · §2.7',
  }),
  reference({
    id: 'openstax-quadratic',
    title: 'OpenStax · Формула корней квадратного уравнения',
    url: 'https://openstax.org/books/elementary-algebra-2e/pages/10-3-solve-quadratic-equations-using-the-quadratic-formula',
    subjects: ['math'],
    publisher: 'OpenStax, Rice University',
    version: 'Elementary Algebra 2e · §10.3',
  }),
  reference({
    id: 'openstax-probability',
    title: 'OpenStax · Равновероятные исходы',
    url: 'https://openstax.org/books/prealgebra-2e/pages/5-5-averages-and-probability',
    subjects: ['math'],
    publisher: 'OpenStax, Rice University',
    version: 'Prealgebra 2e · §5.5',
  }),
  reference({
    id: 'openstax-expectation',
    title: 'OpenStax · Математическое ожидание',
    url: 'https://openstax.org/books/introductory-statistics-2e/pages/4-2-mean-or-expected-value-and-standard-deviation',
    subjects: ['math'],
    publisher: 'OpenStax, Rice University',
    version: 'Introductory Statistics 2e · §4.2',
  }),
  reference({
    id: 'gramota-parts',
    title: 'Грамота.ру · Части речи',
    url: 'https://gramota.ru/biblioteka/spravochniki/russkij-yazyk-kratkij-teoreticheskij-kurs-dlya-shkolnikov/chasti-rechi-v-russkom-yazyke',
    subjects: ['russian'],
    publisher: 'Грамота.ру',
    version: 'Краткий теоретический курс для школьников',
  }),
  reference({
    id: 'gramota-basis',
    title: 'Грамота.ру · Главные члены предложения',
    url: 'https://gramota.ru/biblioteka/spravochniki/prostoe-predlozhenie',
    subjects: ['russian'],
    publisher: 'Грамота.ру',
  }),
  reference({
    id: 'gramota-subordinate',
    title: 'Грамота.ру · Пунктуация сложноподчинённого предложения',
    url: 'https://gramota.ru/biblioteka/spravochniki/pravila-russkoy-orfografii-i-punktuatsii/znaki-prepinaniya-v-slozhnopodchinennom-predlozhenii',
    subjects: ['russian'],
    publisher: 'Грамота.ру',
    version: 'Правила русской орфографии и пунктуации · §115',
  }),
  reference({
    id: 'gramota-ne-ni',
    title: 'Грамота.ру · Различение НЕ и НИ',
    url: 'https://gramota.ru/uchebnik/pravila/razlichenie-chastits-ne-i-ni',
    subjects: ['russian'],
    publisher: 'Грамота.ру',
    note: 'Страница прочитана прямым HTTP-запросом: отрицание, усиление, уступительные конструкции. Текст упражнений не импортируется.',
  }),
  reference({
    id: 'gramota-roots',
    title: 'Грамота.ру · Гласные в чередующихся корнях',
    url: 'https://gramota.ru/uchebnik/pravila/korni-s-cheredovaniem-glasnykh-vybor-kotorykh-zavisit-ot-sleduyushchikh-za-nimi-soglasnykh',
    subjects: ['russian'],
    publisher: 'Грамота.ру',
    note: 'Страница прочитана прямым HTTP-запросом. Условие согласных применяется к безударным гласным; исключения учитываются отдельно.',
  }),
  reference({
    id: 'gramota-participle',
    title: 'Грамота.ру · Обособленные согласованные определения',
    url: 'https://gramota.ru/biblioteka/spravochniki/pravila-russkoy-orfografii-i-punktuatsii/znaki-prepinaniya-pri-obosoblennykh-soglasovannykh-opredeleniyakh',
    subjects: ['russian'],
    publisher: 'Грамота.ру',
  }),
  reference({
    id: 'history-kulikovo-source',
    title: 'Президентская библиотека · Куликовская битва',
    url: 'https://www.prlib.ru/node/619523',
    subjects: ['history'],
    publisher: 'Президентская библиотека',
    note: 'Современная историческая справка учреждения со ссылками на документы и исследования. Год 1380, Дмитрий Донской и Мамай. Не сама летопись.',
  }),
  reference({
    id: 'history-nystad-source',
    title: 'Президентская библиотека · Ништадтский мир',
    url: 'https://www.prlib.ru/node/619530',
    subjects: ['history'],
    publisher: 'Президентская библиотека',
    note: 'Современная справка: 30 августа / 10 сентября 1721 года; окончание войны 1700–1721. Первичный договор указан отдельным источником.',
  }),
  reference({
    id: 'history-nystad-document',
    title: 'МГУ · Текст Ништадтского мирного договора',
    url: 'https://www.hist.msu.ru/ER/Etext/FOREIGN/nishtadt.htm',
    subjects: ['history'],
    publisher: 'Исторический факультет МГУ',
    version: 'Договор 30 августа 1721 года; публикация по сборнику архивных документов 1992 года',
    verification: 'document-text',
    note: 'Первичный исторический документ в научной публикации: преамбула и статьи 1, 4. Архивный текст не перепечатан в карточке.',
  }),
  reference({
    id: 'history-world-war-source',
    title: 'Президентская библиотека · Вторая мировая и Великая Отечественная',
    url: 'https://www.prlib.ru/section/2056946',
    subjects: ['history'],
    publisher: 'Президентская библиотека',
    note: 'Тематическая коллекция с рамками 1939–1945 и 1941–1945. Не выдаётся за единый первичный документ.',
  }),
  reference({
    id: 'history-1941-source',
    title: 'Президентская библиотека · 22 июня 1941 года',
    url: 'https://www.prlib.ru/history/619331',
    subjects: ['history'],
    publisher: 'Президентская библиотека',
    note: 'Справка учреждения с архивными документами и записью заявления 22 июня 1941 года. Использована для даты и контекста начала войны.',
  }),
  reference({
    id: 'versailles-1789',
    title: 'Версаль · Клятва в зале для игры в мяч',
    url: 'https://en.chateauversailles.fr/discover/history/key-dates/jeu-paume-oath-1789',
    subjects: ['history'],
    publisher: 'Château de Versailles',
    note: 'Собственная историческая публикация музея: события июня 1789 года. Не дословный текст клятвы.',
  }),
  reference({
    id: 'openstax-demand',
    title: 'OpenStax · Спрос, предложение и равновесие',
    url: 'https://openstax.org/books/principles-economics-3e/pages/3-1-demand-supply-and-equilibrium-in-markets-for-goods-and-services',
    subjects: ['social'],
    publisher: 'OpenStax, Rice University',
    version: 'Principles of Economics 3e · §3.1',
  }),
  reference({
    id: 'openstax-groups',
    title: 'OpenStax · Типы социальных групп',
    url: 'https://openstax.org/books/introduction-sociology-3e/pages/6-1-types-of-groups',
    subjects: ['social'],
    publisher: 'OpenStax, Rice University',
    version: 'Introduction to Sociology 3e · §6.1',
  }),
  reference({
    id: 'openstax-organizations',
    title: 'OpenStax · Формальные организации',
    url: 'https://openstax.org/books/introduction-sociology-3e/pages/6-3-formal-organizations',
    subjects: ['social'],
    publisher: 'OpenStax, Rice University',
    version: 'Introduction to Sociology 3e · §6.3',
  }),
  reference({
    id: 'openstax-mobility',
    title: 'OpenStax · Социальная мобильность',
    url: 'https://openstax.org/books/introduction-sociology-3e/pages/9-2-social-stratification-and-mobility-in-the-united-states',
    subjects: ['social'],
    publisher: 'OpenStax, Rice University',
    version: 'Introduction to Sociology 3e · §9.2',
    note: 'Использованы общие определения мобильности; статистика и устройство социальных классов США в карточку не перенесены.',
  }),
  reference({
    id: 'fns-tax-classification',
    title: 'ФНС · Прямые и косвенные налоги',
    url: 'https://www.nalog.gov.ru/html/docs/15.10.12_IP.pdf',
    subjects: ['social'],
    publisher: 'ФНС России',
    version: 'Архивная учебная памятка для ИП',
    verification: 'publisher-search-excerpt',
    note: 'Определения проверены в индексированном фрагменте PDF издателя. Прямое скачивание в этой сессии вернуло 403. Архивная памятка используется только для классификации, не для действующих ставок, льгот или режимов.',
  }),
  reference({
    id: 'constitution-article10',
    title: 'Государственная Дума · Конституция РФ, статья 10',
    url: 'https://duma.gov.ru/legislative/documents/constitution/',
    subjects: ['social'],
    publisher: 'Государственная Дума РФ',
    version: 'Статья 10 · проверка формулировки 2026-09-08',
    verification: 'publisher-search-excerpt',
    note: 'Формулировка принципа разделения властей подтверждена индексированным текстом официальной страницы. Прямой запрос завершился тайм-аутом; полный аудит редакции Конституции не заявлен.',
  }),
  reference({
    id: 'openstax-argument',
    title: 'OpenStax · Основания и вывод аргумента',
    url: 'https://openstax.org/books/introduction-philosophy/pages/5-3-arguments',
    subjects: ['social'],
    publisher: 'OpenStax, Rice University',
    version: 'Introduction to Philosophy · §5.3',
  }),
];

// checkedAt records an actual read of the publisher page, not a claimed audit of every linked file.
export const sources: LearningSource[] = [
  ...schoolProgrammeSources,
  ...fipiArchives,
  ...factualReferences,
  ...(
    [
      ['math', 'Математика · рекомендации', 'MR_matematika_ege_2026.pdf'],
      ['russian', 'Русский язык · рекомендации', 'MR_rus_yaz_ege_2026.pdf'],
      [
        'history',
        'История России с 1682 до 1825 года · навигатор',
        '2026/is-3-istorija-rossii-do-1801.pdf',
      ],
      ['social', 'Обществознание · рекомендации', 'MR_obcschestvo_ege_2026.pdf'],
    ] as const
  ).map(
    ([subject, title, filename]): LearningSource => ({
      id: `fipi-${subject}-navigator-2026`,
      title: `ФИПИ · ${title} · 2026`,
      url: `https://doc.fipi.ru/navigator-podgotovki/navigator-ege/${filename}`,
      subjects: [subject],
      checkedAt: '2026-09-08',
      version: '2026 · материалы самостоятельной подготовки',
      publisher: 'ФГБНУ «ФИПИ»',
      status: 'official-reference',
      role: 'curriculum',
      publicationStatus: 'final',
      verification: 'document-text',
      note: 'PDF сохранён в локальном пакете источников с SHA-256. Рекомендации используются для ориентации в подготовке; упражнения не перенесены в карточки Cosmos.',
    }),
  ),
  {
    id: 'fipi-changes-2027-project',
    title: 'ФИПИ · Планируемые изменения КИМ 2027',
    url: 'https://doc.fipi.ru/ege/demoversii-specifikacii-kodifikatory/2027/Plan_izmeneniya_KIM_EGE_2027.pdf',
    subjects: allSubjects,
    checkedAt: '2026-09-08',
    version: '2027 · проект изменений',
    publisher: 'ФГБНУ «ФИПИ»',
    status: 'official-reference',
    role: 'curriculum',
    publicationStatus: 'draft',
    verification: 'document-text',
    note: 'Прочитан двухстраничный документ планируемых изменений. Предложения по профильной математике и всеобщей истории не выдаются за окончательную структуру 2027. Числа заданий не используются для автоматической оценки прогресса.',
  },
  {
    id: 'fipi-demo',
    title: 'ФИПИ · Демоверсии, спецификации и кодификаторы',
    url: 'https://fipi.ru/ege/demoversii-specifikacii-kodifikatory',
    subjects: allSubjects,
    checkedAt: '2026-09-08',
    version: '2027 — проекты; 2026 — утверждённые материалы',
    publisher: 'ФГБНУ «ФИПИ»',
    status: 'official-reference',
    role: 'curriculum',
    verification: 'publisher-page',
    note: 'На дату проверки материалы 2027 года опубликованы как проекты. Обсуждение — до 30 сентября 2026 года. Страница проверена; задания этой сборки не импортированы из демоверсий.',
  },
  {
    id: 'fipi-navigator',
    title: 'ФИПИ · Навигатор самостоятельной подготовки',
    url: 'https://fipi.ru/navigator-podgotovki/navigator-ege',
    subjects: allSubjects,
    checkedAt: '2026-09-08',
    version: 'Навигатор ЕГЭ · материалы 2026',
    publisher: 'ФГБНУ «ФИПИ»',
    status: 'official-reference',
    role: 'curriculum',
    publicationStatus: 'reference',
    verification: 'publisher-page',
    note: 'Официальная точка входа для тематических рекомендаций. Полное сопоставление библиотеки Cosmos с кодификатором пока не проведено.',
  },
  {
    id: 'fipi-bank',
    title: 'ФИПИ · Открытый банк заданий ЕГЭ',
    url: 'https://fipi.ru/ege/otkrytyy-bank-zadaniy-ege',
    subjects: allSubjects,
    checkedAt: '2026-09-07',
    version: 'Публичная страница банка',
    publisher: 'ФГБНУ «ФИПИ»',
    status: 'official-reference',
    note: 'Ссылка на официальный банк. Локальная коллекция не заявлена копией банка; официальные задания не добавлены в эту сборку.',
  },
  {
    id: 'history-baptism-source',
    title: 'Президентская библиотека · Крещение Руси',
    url: 'https://www.prlib.ru/node/1161636',
    subjects: ['history'],
    checkedAt: '2026-09-07',
    version: 'Материал библиотеки, 2018',
    publisher: 'Президентская библиотека',
    status: 'primary-reference',
    role: 'fact',
    publicationStatus: 'reference',
    verification: 'publisher-page',
    note: '988 год — традиционная дата Крещения Руси. Христианизация земель была длительным процессом.',
  },
  {
    id: 'history-reform-source',
    title: 'Президентская библиотека · Крестьянская реформа 1861 года',
    url: 'https://www.prlib.ru/collections/467127',
    subjects: ['history'],
    checkedAt: '2026-09-07',
    version: 'Коллекция документов реформы 1861 года',
    publisher: 'Президентская библиотека',
    status: 'primary-reference',
    role: 'fact',
    publicationStatus: 'reference',
    verification: 'publisher-page',
    note: 'Манифест подписан Александром II 19 февраля 1861 года по старому стилю, 3 марта — по новому. Коллекция содержит исторические документы.',
  },
  {
    id: 'cosmos-training',
    title: 'Cosmos · Локальная учебная библиотека',
    url: '',
    subjects: allSubjects,
    checkedAt: '2026-09-08',
    version: `Приложение ${applicationVersion} · база 2026.09.08.3`,
    publisher: 'EGE Cosmos',
    status: 'local-training',
    role: 'authorship',
    publicationStatus: 'authored',
    note: 'Авторские учебные объяснения и синтетические задания для освоения основ. Это не официальные задания ФИПИ и не полный курс ЕГЭ.',
  },
];

export const materialLabels: Record<MaterialStatus, string> = {
  official: 'Официальное задание ФИПИ',
  training: 'Тренировочный материал Cosmos',
  synthetic: 'Учебный пример Cosmos',
  model: 'Объяснение локальной модели',
};

export function sourcesForSubject(subject: SubjectId): LearningSource[] {
  return sources.filter((source) => source.subjects.includes(subject));
}

export function getSource(id: string): LearningSource | undefined {
  return sources.find((source) => source.id === id);
}
