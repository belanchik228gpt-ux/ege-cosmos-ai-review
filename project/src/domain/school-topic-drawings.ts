import { historyAtlasDrawing } from './topic-scenes/history-atlas';
import { lessonLabDrawing } from './topic-scenes/lesson-lab';
import { civicsExpandedDrawing } from './topic-scenes/civics-expanded';
import { chemistryExpandedDrawing } from './topic-scenes/chemistry-expanded';
import type { TutorDrawing } from './cloud-learning';
import type { SchoolUnit } from './school-program/types';
import { mathInformaticsDrawing } from './topic-scenes/math-informatics';
import { naturalSciencesDrawing } from './topic-scenes/natural-sciences';
import { humanitiesDrawing } from './topic-scenes/humanities';

const scene = (
  kind: TutorDrawing['kind'],
  title: string,
  steps: TutorDrawing['steps'],
): TutorDrawing => ({ kind, title: `Авторский пример · ${title}`, steps });
/** Small authored illustrations, never a reconstruction of the student's problem.
 * A supplied focus is authoritative: broad unit keywords must not replace a different subtopic. */
export function topicDrawing(unit: SchoolUnit, focus = ''): TutorDrawing {
  const topic = (focus.trim() || unit.title).toLocaleLowerCase('ru').replaceAll('ё', 'е');
  const authored =
    lessonLabDrawing(unit, topic) ||
    historyAtlasDrawing(unit, topic) ||
    civicsExpandedDrawing(unit, topic) ||
    chemistryExpandedDrawing(unit, topic) ||
    mathInformaticsDrawing(unit, topic) ||
    naturalSciencesDrawing(unit, topic) ||
    humanitiesDrawing(unit, topic);
  if (authored) return authored;
  if (unit.subject === 'math') {
    if (/модул|абсолютн/.test(topic))
      return scene('number-line', 'Модуль — расстояние до нуля', [
        {
          caption: 'Для отдельного примера выберем точку −3. Начало отсчёта — ноль.',
          values: [0, -3],
          labels: ['Ноль', 'Точка −3'],
        },
        {
          caption: 'До нуля три единицы. Расстояние не бывает отрицательным.',
          values: [-3, 0],
          formula: '|-3|=3',
          labels: ['Расстояние: 3'],
        },
        {
          caption: 'Точка 3 находится на таком же расстоянии с другой стороны.',
          values: [0, 3],
          formula: '|3|=|-3|=3',
        },
      ]);
    if (/^(?:дроби|обыкновенные дроби|обыкновенная дробь|доля и дробь)[.!]?$/u.test(topic))
      return scene('number-line', 'Одна четверть и три четверти', [
        {
          caption: 'Целое — отрезок от 0 до 1; знаменатель 4 означает четыре равные части.',
          values: [0, 1],
          labels: ['Целое: 1'],
        },
        {
          caption: 'Одна такая часть заканчивается в точке 1/4.',
          values: [0, 0.25],
          formula: '\\frac14=0{,}25',
        },
        {
          caption: 'Три равные части занимают три четверти целого.',
          values: [0, 0.75],
          formula: '\\frac34=0{,}75',
          labels: ['Взято 3 части из 4'],
        },
      ]);
    if (/линейн.*уравн|уравнен.*первой степ/.test(topic))
      return scene('algebra', 'Равенство сохраняется при одинаковом действии', [
        { caption: 'Отдельный пример линейного уравнения.', formula: '2x+3=11' },
        { caption: 'Вычитаем 3 из обеих частей.', formula: '2x=8' },
        {
          caption: 'Делим обе части на 2; затем подставляем для проверки.',
          formula: 'x=4,\\qquad 2\\cdot4+3=11',
        },
      ]);
    if (/линейн.*функц|график.*линейн/.test(topic))
      return scene('function', 'Точки графика y = 2x + 1', [
        {
          caption: 'Вычислим значения функции для x=0 и x=1.',
          values: [0, 1, 1, 3],
          formula: 'y=2x+1',
        },
        {
          caption: 'Для x=−1 получаем −1. Три точки лежат на одной прямой.',
          values: [-1, -1, 0, 1, 1, 3],
          formula: '2(-1)+1=-1',
        },
        {
          caption: 'Это участок прямой между показанными точками, а не весь бесконечный график.',
          values: [-1, -1, 0, 1, 1, 3],
          labels: ['При увеличении x на 1 значение y увеличивается на 2'],
        },
      ]);
    if (/площад.*треугол/.test(topic))
      return scene('geometry', 'Площадь треугольника', [
        {
          caption: 'Отдельный треугольник: основание 6 см, высота к нему 4 см.',
          values: [6, 4],
          labels: ['Основание 6 см', 'Высота 4 см'],
        },
        {
          caption: 'Умножим основание на высоту и разделим на два.',
          values: [6, 4],
          formula: 'S=\\frac{ah}{2}=\\frac{6\\cdot4}{2}=12\\text{ см}^2',
        },
      ]);
    if (/площад.*прямоугол/.test(topic))
      return scene('geometry', 'Площадь прямоугольника', [
        {
          caption: 'Отдельный пример: длина 7 см, ширина 4 см. Сетка состоит из квадратов 1×1 см.',
          values: [7, 4],
          labels: ['7 клеток в ряду', '4 ряда'],
        },
        {
          caption: 'Четыре одинаковых ряда по семь клеток дают 28 квадратных сантиметров.',
          values: [7, 4],
          formula: 'S=ab=7\\cdot4=28\\text{ см}^2',
        },
      ]);
  }
  if (unit.subject === 'physics') {
    if (/второй.*ньютон|законы.*ньютон|равнодейств|результирующ.*сил/.test(topic))
      return scene('concept', 'Результирующая сила и ускорение', [
        {
          caption:
            'Учебная модель: масса 2 кг, результирующая сила 6 Н направлена вправо. Рассматриваем инерциальную систему.',
          labels: ['Масса, кг', 'Сила, Н'],
          values: [2, 6],
        },
        {
          caption:
            'Ускорение направлено вправо, по результирующей силе. Это не обязательно направление скорости.',
          labels: ['Масса, кг', 'Сила, Н'],
          values: [2, 6],
          formula: '$a=F/m=6/2=3\\text{ м/с}^2$',
        },
      ]);
    if (/закон ома|сопротивлен|сила тока/.test(topic))
      return scene('algebra', 'Закон Ома для участка цепи', [
        {
          caption:
            'Отдельный резистор при постоянной температуре: напряжение 6 В, сопротивление 3 Ом.',
          formula: 'U=6\\text{ В},\\quad R=3\\text{ Ом}',
        },
        {
          caption: 'Сила тока равна отношению напряжения к сопротивлению.',
          formula: 'I=\\frac UR=\\frac63=2\\text{ А}',
        },
        {
          caption: 'При том же сопротивлении удвоение напряжения удваивает ток.',
          formula: 'U=12\\text{ В}\\Rightarrow I=4\\text{ А}',
        },
      ]);
  }
  if (unit.subject === 'chemistry' && /строени.*атом|атом.*водород/.test(topic))
    return scene('concept', 'Нейтральный атом водорода', [
      {
        caption: 'У простейшего изотопа водорода в ядре один протон; вне ядра — один электрон.',
        labels: ['Протон в ядре', 'Электрон вне ядра'],
        values: [1, 1],
      },
      {
        caption:
          'Противоположные заряды компенсируются. Изображение условное: окружность не означает точную траекторию электрона.',
        labels: ['Протон в ядре', 'Электрон вне ядра'],
        values: [1, 1],
        formula: '$+1+(-1)=0$',
      },
    ]);
  if (unit.subject === 'chemistry' && /ковалентн|химическ.*связ/.test(topic))
    return scene('algebra', 'Общая электронная пара в H₂', [
      {
        caption: 'У каждого атома водорода один электрон. Точки — условные обозначения электронов.',
        formula: '\\mathrm{H}\\!\\cdot\\qquad\\cdot\\!\\mathrm{H}',
      },
      {
        caption:
          'Общая пара соответствует одной ковалентной связи; каждый атом учитывает оба общих электрона.',
        formula:
          '\\mathrm{H}{:}\\mathrm{H}\\quad\\longleftrightarrow\\quad\\mathrm{H}{-}\\mathrm{H}',
      },
    ]);
  if (
    unit.subject === 'biology' &&
    /^(?:клетка|строение клетки|эукариотическая клетка|животная клетка|строение животной клетки|три части эукариотической клетки)[.!]?$/u.test(
      topic,
    ) &&
    !/прокариот|бактер|растительн|митоз|мейоз/.test(topic)
  )
    return scene('concept', 'Три части эукариотической клетки', [
      {
        caption:
          'Условный пример животной клетки: наружная мембрана отделяет её содержимое от среды.',
        labels: ['Мембрана', 'Цитоплазма', 'Ядро'],
      },
      {
        caption:
          'Внутри — цитоплазма с органоидами. Ядро содержит основную часть наследственного материала. Это не схема всех видов клеток.',
        labels: ['Мембрана', 'Цитоплазма', 'Ядро'],
      },
    ]);
  if (unit.subject === 'informatics' && /двоич|систем.*счислен/.test(topic))
    return scene('algebra', 'Разряды двоичной записи 1011', [
      {
        caption: 'Справа налево веса разрядов: 1, 2, 4, 8.',
        formula: '(1011)_2=1\\cdot2^3+0\\cdot2^2+1\\cdot2^1+1\\cdot2^0',
      },
      { caption: 'Берём только веса разрядов с единицами.', formula: '8+0+2+1=11' },
      {
        caption: 'Обе записи обозначают одно число; основания разные.',
        formula: '(1011)_2=(11)_{10}',
      },
    ]);
  if (unit.subject === 'russian' && /сложноподчин|придаточ/.test(topic))
    return scene('syntax', 'Граница главного и придаточного', [
      {
        caption: 'Авторский пример: «Я знаю, что ты придёшь». Найдём две грамматические основы.',
        labels: ['Подлежащее: я', 'Сказуемое: знаю', 'Подлежащее: ты', 'Сказуемое: придёшь'],
      },
      {
        caption: 'От главного задаём вопрос: знаю что? Придаточное отвечает на него.',
        labels: ['Главное: Я знаю', 'Придаточное: что ты придёшь'],
      },
      {
        caption:
          'Запятая отделяет придаточную часть. Не любое слово «что» автоматически требует запятой.',
        formula: 'Я знаю, что ты придёшь.',
        labels: ['Главное: Я знаю', ',', 'Придаточное: что ты придёшь'],
      },
    ]);
  if (unit.subject === 'english' && /present simple|настоящ.*прост/.test(topic))
    return scene('syntax', 'Present Simple: действие и вопрос', [
      {
        caption: 'Регулярное действие: she + plays. Для he/she/it в утверждении добавляется -s.',
        labels: ['Подлежащее: She', 'Сказуемое: plays', 'tennis every Sunday.'],
      },
      {
        caption: 'В вопросе does уже выражает третье лицо; основной глагол возвращается к play.',
        labels: ['Does', 'Подлежащее: she', 'Сказуемое: play', 'tennis every Sunday?'],
      },
    ]);
  if (unit.subject === 'history' && /отмен.*крепост|крестьянск.*реформ.*1861/.test(topic))
    return scene('history', 'Крестьянская реформа 1861 года', [
      {
        caption:
          'Российская империя. Александр II подписал манифест 19 февраля 1861 года по старому стилю.',
        labels: ['1861', 'Александр II', 'Манифест'],
        values: [1861],
      },
      {
        caption:
          'Крестьяне получили личную свободу. Земельный вопрос решался с условиями и выкупными платежами: свобода не означала бесплатную передачу всей земли.',
        labels: ['Личная свобода', 'Земельные условия', 'Выкупные платежи'],
      },
    ]);
  // Unknown focus must remain about that focus, not silently switch to a solved example from another topic.
  const labels = (focus.trim() ? [focus] : unit.topics).map((x) => x.slice(0, 300)).slice(0, 4);
  return {
    kind: 'concept',
    title: `Схема содержания · ${(focus.trim() || unit.title).slice(0, 180)}`,
    steps: [
      {
        caption:
          'Это карта выбранного содержания. Отдельный предметный рисунок для этой темы пока не подготовлен.',
        labels: labels.length ? labels : [unit.title.slice(0, 300)],
      },
      {
        caption:
          'Выбери вопрос по теме. Преподаватель сможет предложить пояснение и рисунок по твоему условию.',
        labels: ['Уточнить вопрос', 'Разобрать пример', 'Попробовать самостоятельно'],
      },
    ],
  };
}
