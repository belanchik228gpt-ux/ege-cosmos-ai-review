import { InfoTip } from './InfoTip';
import { getSchoolSubject } from '../domain/school-program';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Atom,
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  FileText,
  Flame,
  Home,
  Info,
  Landmark,
  Layers3,
  LayoutGrid,
  Menu,
  Mic,
  Orbit,
  Plus,
  Play,
  Rocket,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sigma,
  Sparkles,
  Target,
  Telescope,
  TrendingUp,
  Volume2,
  VolumeX,
  X,
  Star,
  Maximize2,
  Minimize2,
  NotebookPen,
  Library,
  ClipboardCheck,
  ClipboardList,
} from 'lucide-react';
import {
  subjects,
  topics,
  appendDiscussion,
  startSession,
  submitAnswer,
  finishSession,
  getStats,
  clearSubjectHistory,
  buildPlan,
  topicStatus,
  type SubjectId,
  type LearningState,
} from '../domain';
import { TutorRoom as Room } from './TutorRoom';
import { CloudRoom } from './CloudRoom';
import { StudioNavigation } from './StudioNavigation';
import { SchoolWorkspace, schoolViewNames } from './SchoolWorkspace';
import { createSchoolState, type SchoolView } from '../domain/school-state';
import { StudioHome } from './StudioHome';
import { StudioDay } from './StudioDay';
import { StudioCatalog } from './StudioCatalog';
import { setEgeTopicSkipped } from '../domain/ege-topic-skips';
import { ExamWorkshop } from './ExamWorkshop';
import type { ExamWorkshopTask } from '../domain/exam-workshop';
import { OpenAIConnection } from './OpenAIConnection';
import { useOpenAI } from './useOpenAI';
import { getGradeRoute, getSchoolTopic, type SchoolTopic } from '../domain/school-catalog';
import { createCloudLesson, type CloudLesson, type CloudMode } from '../domain/cloud-learning';
import { ProblemWorkspace } from './ProblemWorkspace';
import { InterfaceEffects } from './InterfaceEffects';
import { PreferencesContext } from './PreferencesContext';
import { useLearning } from './useLearning';
import { useLessonActivity } from './useLessonActivity';
import { OrbitArt } from './OrbitArt';
import { Documents } from './Documents';
import { Settings } from './Settings';
import { ImportedBackdrop } from './ImportedBackdrop';
import { applyAppearance } from './appearance';
import { QuickJump } from './QuickJump';
import { KnowledgeLibrary } from './KnowledgeLibrary';
import { SourceLinks } from './SourceLinks';
import { LearningCheckin } from './LearningCheckin';
import { Homework } from './Homework';
import { HomeworkDesk } from './HomeworkDesk';
import { DailyDashboard, StudyCalendar } from './StudyDashboard';
import { StudyRunView } from './StudyRunView';
import { CurriculumBrowser } from './CurriculumBrowser';
import { CurriculumScene } from '../scenes/CurriculumScene';
import { useStudyActivity } from './useStudyActivity';
import { createStudyWorkspace } from '../domain/workspace';
import { curriculumNodes } from '../domain/curriculum-data';
import {
  createPlanningState,
  generateStudyPlan,
  localStudyDate,
  pauseStudyDay,
  resumeStudyDay,
  setStudyBlockNote,
  skipStudyBlock,
} from '../domain/study-plan';
import {
  ensureTodayPlan,
  addCurriculumToDay,
  addPersonalToDay,
  addSchoolToDay,
  startDailyLearning,
  enterDailyBlock,
  completeDailyBlock,
  finishDailyLearning,
  refitStudyDay,
} from '../domain/study-actions';
import { latestDiagnostic, diagnosticMemory } from '../domain/diagnostics';
import { createHomework, getSubjectHomework, homeworkMemory } from '../domain/homework';
import {
  prepareTutorEvidence,
  reviewEvidenceNumbers,
  authoredEvidenceFallback,
} from '../domain/evidence';
import {
  prepareGrounding,
  isExamReferenceQuery,
  examReferenceReply,
  reviewTutorResponse,
} from '../domain/grounding';

export const subjectIcons = {
  math: Sigma,
  russian: BookOpen,
  history: Landmark,
  social: Layers3,
};
export const statusNames: Record<string, string> = {
  new: 'Начнём знакомство',
  learning: 'В процессе',
  review: 'Закрепляем',
  mastered: 'Подтверждено',
};
export const dateLabel = (date: string | number = Date.now()) =>
  new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
export type Page =
  | 'school'
  | 'home'
  | 'room'
  | 'hq'
  | 'documents'
  | 'memory'
  | 'settings'
  | 'backgrounds'
  | 'knowledge'
  | 'checkin'
  | 'homework'
  | 'homework-desk'
  | 'plan'
  | 'curriculum'
  | 'exam-workshop'
  | 'study'
  | 'resources'
  | 'problem'
  | 'practice';
export function IconBadge({ children, color = 'purple' }: { children: ReactNode; color?: string }) {
  return <span className={`icon-badge ${color}`}>{children}</span>;
}
export function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function App() {
  const { state, setState, ready, saveError } = useLearning();
  const [page, setPage] = useState<Page>('home');
  const ai = useOpenAI();
  const [authOpen, setAuthOpen] = useState(false);
  const [cloudId, setCloudId] = useState<string>();
  const [subject, setSubject] = useState<SubjectId>('math');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  const [model, setModel] = useState({ available: false, model: '' });
  const [commandOpen, setCommandOpen] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState(0);
  const schoolMode = state.school?.enabled === true;
  function schoolNavigate(view: SchoolView) {
    setState((s) => ({
      ...s,
      school: { ...(s.school || createSchoolState()), enabled: true, view },
    }));
    setPage('school');
    window.scrollTo({ top: 0 });
  }
  function switchMode(mode: 'school' | 'ege') {
    setState((s) => ({
      ...s,
      school: { ...(s.school || createSchoolState()), enabled: mode === 'school' },
    }));
    routeHistory.current = [];
    setCommandOpen(false);
    setPage(mode === 'school' ? 'school' : 'home');
    window.scrollTo({ top: 0 });
  }
  function searchCurrentMode() {
    if (schoolMode) {
      schoolNavigate('subjects');
      setSchoolSearch((n) => n + 1);
    } else setCommandOpen(true);
  }
  const [problemSeed, setProblemSeed] = useState('');
  const [problemImage, setProblemImage] = useState<File>();
  function openProblem(text = '', photo?: File) {
    setProblemSeed(text);
    setProblemImage(photo);
    navigate('problem');
  }
  const [knowledgeId, setKnowledgeId] = useState<string | undefined>();
  const [documentSessionId, setDocumentSessionId] = useState<string | undefined>();
  const [homeworkSessionId, setHomeworkSessionId] = useState<string | undefined>();
  const [currentTime, setCurrentTime] = useState(Date.now);
  const [studyRunId, setStudyRunId] = useState<string>();
  const routeHistory = useRef<
    Array<{
      page: Page;
      subject: SubjectId;
      sessionId: string | null;
      documentSessionId?: string;
      knowledgeId?: string;
      homeworkSessionId?: string;
      studyRunId?: string;
      cloudId?: string;
    }>
  >([]);
  const planning = state.planning || createPlanningState();
  const workspace = state.studyWorkspace || createStudyWorkspace();
  const activeRun = planning.activeRunId ? planning.runs[planning.activeRunId] : undefined;
  const viewedRun = planning.runs[studyRunId || planning.activeRunId || ''];
  const guidedBlock = viewedRun?.blocks.find((block) => block.id === viewedRun.activeBlockId);
  useStudyActivity(
    viewedRun?.id,
    page === 'study' && viewedRun?.id === activeRun?.id && viewedRun?.status === 'active',
    setState,
  );
  const today = localStudyDate(currentTime);
  useEffect(() => {
    if (ready && !schoolMode && !state.planning?.days[today])
      setState((current) => ensureTodayPlan(current, today));
  }, [ready, today, schoolMode, !!state.planning?.days[today], setState]);
  useEffect(() => {
    if (ready && state.school?.enabled) setPage('school');
  }, [ready]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) setCurrentTime(Date.now());
    };
    const timer = setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !onboarding) {
        event.preventDefault();
        searchCurrentMode();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onboarding, schoolMode]);
  useEffect(() => {
    if (ready && state.profile.name === 'Ученик') setOnboarding(true);
  }, [ready]);
  useEffect(() => {
    let live = true;
    window.cosmos
      ?.modelStatus()
      .then((s) => {
        if (live) setModel({ available: s.available, model: s.model || '' });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [page]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(''), 6000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    document.documentElement.dataset.motion = state.settings.reducedMotion ? 'reduced' : 'full';
    document.documentElement.dataset.quality = state.settings.quality;
    applyAppearance(state.settings);
  }, [state.settings]);
  const stats = getStats(state, currentTime);
  const pendingHomework = Object.values(state.homework ?? {}).filter(
    (work) => work.phase !== 'completed',
  );
  const dueHomework = Object.values(state.homework ?? {}).filter(
    (work) =>
      work.phase === 'completed' && work.repeatAt && Date.parse(work.repeatAt) <= currentTime,
  );
  function navigate(p: Page, remember = false) {
    if (p === 'checkin' || p === 'homework') {
      const topic = getGradeRoute(subject, 10, state.planning?.preferences.mathLevel ?? 'basic')[0];
      if (topic) {
        startCloud(topic, p === 'checkin' ? 'diagnostic' : 'homework');
        return;
      }
    }
    if (p !== page || remember) {
      routeHistory.current = [
        ...routeHistory.current.slice(-19),
        {
          page,
          subject,
          sessionId,
          documentSessionId,
          knowledgeId,
          homeworkSessionId,
          studyRunId,
          cloudId,
        },
      ];
    }
    if (p === 'documents') setDocumentSessionId(undefined);
    if (p === 'homework') setHomeworkSessionId(undefined);
    if (p === 'knowledge') setKnowledgeId(undefined);
    setPage(p);
    window.scrollTo({ top: 0 });
  }
  function startCloud(topic: SchoolTopic, mode: CloudMode = 'lesson') {
    const lesson = createCloudLesson(
      topic.subject,
      topic.id,
      topic.recommendedStart?.title ?? topic.subtopics[0] ?? topic.title,
      mode,
      state.profile.dailyMinutes,
    );
    setState((current) => ({
      ...current,
      cloudSessions: { ...current.cloudSessions, [lesson.id]: lesson },
    }));
    setSubject(topic.subject);
    setCloudId(lesson.id);
    navigate('room', true);
  }
  function continueCloud(id: string) {
    const lesson = state.cloudSessions?.[id];
    if (lesson) {
      const run = Object.values(state.planning?.runs ?? {}).find(
        (r) => id === `day:${r.id}:${r.activeBlockId}` && !r.report,
      );
      if (run) {
        setStudyRunId(run.id);
        navigate('study');
        return;
      }
      setSubject(lesson.subject);
      setCloudId(id);
      navigate('room', id !== cloudId);
    }
  }
  function startExamTraining(task: ExamWorkshopTask, total: number) {
    if (!Number.isInteger(total) || total < 1 || total > 30) return;
    const requestedTopic = task.topicId
      ? (getSchoolTopic(task.topicId) ?? topics.find((topic) => topic.id === task.topicId))
      : undefined;
    const topicId =
      requestedTopic?.subject === task.subject
        ? requestedTopic.id
        : `exam-${task.subject}-${task.number}`;
    const lesson: CloudLesson = {
      ...createCloudLesson(
        task.subject,
        topicId,
        `ЕГЭ · № ${task.number} · ${task.title}`,
        'own',
        state.profile.dailyMinutes,
      ),
      examTraining: { number: task.number, total, current: 1, completed: [] as number[] },
    };
    setState((current) => ({
      ...current,
      cloudSessions: { ...current.cloudSessions, [lesson.id]: lesson },
    }));
    setSubject(task.subject);
    setCloudId(lesson.id);
    navigate('room', true);
  }
  function openRoom(id: SubjectId) {
    const last = Object.values(state.cloudSessions ?? {})
      .filter((l) => l.subject === id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (last) {
      setSubject(id);
      setCloudId(last.id);
      navigate('room', last.id !== cloudId);
    } else {
      const topic = getGradeRoute(id, 10, state.planning?.preferences.mathLevel ?? 'basic')[0];
      if (topic) startCloud(topic);
      else {
        setSubject(id);
        navigate('curriculum');
      }
    }
  }
  function begin(topicId: string) {
    const schoolTopic = getSchoolTopic(topicId);
    if (schoolTopic) {
      startCloud(schoolTopic);
      return;
    }
    const active = Object.values(state.sessions)
      .filter((s) => s.topicId === topicId && !s.completedAt)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (active) {
      setSessionId(active.id);
      setSubject(active.subject);
      navigate('practice');
      return;
    }
    const result = startSession(state, topicId);
    setState(result.state);
    setSessionId(result.sessionId);
    setSubject(topics.find((t) => t.id === topicId)!.subject);
    navigate('practice');
  }
  function resume() {
    if (activeRun) {
      setStudyRunId(activeRun.id);
      navigate('study');
      return;
    }
    const cloud = Object.values(state.cloudSessions ?? {})
      .filter((s) => !s.completedAt && s.messages.length > 0)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (cloud) {
      continueCloud(cloud.id);
      return;
    }
    const active = Object.values(state.sessions)
      .filter((s) => !s.completedAt)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (active) {
      setSessionId(active.id);
      setSubject(active.subject);
      navigate('practice');
    } else startDay();
  }
  function goBack() {
    const previous = routeHistory.current.pop();
    if (!previous) {
      setPage('home');
      return;
    }
    setPage(previous.page);
    setSubject(previous.subject);
    setSessionId(previous.sessionId);
    setDocumentSessionId(previous.documentSessionId);
    setKnowledgeId(previous.knowledgeId);
    setHomeworkSessionId(previous.homeworkSessionId);
    setStudyRunId(previous.studyRunId);
    setCloudId(previous.cloudId);
    window.scrollTo({ top: 0 });
  }
  function changeLearning(update: (current: LearningState) => LearningState): boolean {
    let ok = true;
    setState((current) => {
      try {
        return update(current);
      } catch (error) {
        ok = false;
        queueMicrotask(() =>
          setNotice(error instanceof Error ? error.message : 'Изменение не сохранено.'),
        );
        return current;
      }
    });
    return ok;
  }
  function openCurriculum(id?: string, date?: string) {
    setState((current) => ({
      ...current,
      studyWorkspace: {
        ...(current.studyWorkspace || createStudyWorkspace()),
        curriculumNodeId: id,
        ...(date ? { planDate: date } : {}),
      },
    }));
    navigate('curriculum');
  }
  function startDay(date = localStudyDate()) {
    try {
      const result = startDailyLearning(state, date);
      let next = result.state;
      const run = next.planning!.runs[result.runId];
      const block =
        run.blocks.find((b) => b.id === run.activeBlockId) ||
        run.blocks.find((b) => b.status === 'pending');
      if (block && !block.startedAt) next = enterDailyBlock(next, result.runId, block.id).state;
      setState(next);
      setStudyRunId(result.runId);
      navigate('study');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Не удалось открыть план. Попробуй выбрать другой день.',
      );
    }
  }
  function enterBlock(id: string) {
    if (!viewedRun) return;
    changeLearning((current) => enterDailyBlock(current, viewedRun.id, id).state);
  }
  function nextBlock() {
    if (!viewedRun || !guidedBlock) return;
    changeLearning((current) => {
      let next = completeDailyBlock(current, viewedRun.id, guidedBlock.id);
      const cloudId = `day:${viewedRun.id}:${guidedBlock.id}`;
      const cloud = next.cloudSessions?.[cloudId];
      if (cloud && !cloud.completedAt)
        next = {
          ...next,
          cloudSessions: {
            ...next.cloudSessions,
            [cloudId]: { ...cloud, completedAt: new Date().toISOString() },
          },
        };
      const pending = next.planning!.runs[viewedRun.id].blocks.find(
        (block) => block.status === 'pending',
      );
      if (pending) next = enterDailyBlock(next, viewedRun.id, pending.id).state;
      else next = finishDailyLearning(next, viewedRun.id, false);
      return next;
    });
  }
  function finishDay(early: boolean) {
    if (viewedRun)
      changeLearning((current) => {
        const next = finishDailyLearning(current, viewedRun.id, early);
        const completedAt = new Date().toISOString();
        return {
          ...next,
          cloudSessions: Object.fromEntries(
            Object.entries(next.cloudSessions ?? {}).map(([id, lesson]) => [
              id,
              id.startsWith(`day:${viewedRun.id}:`) && !lesson.completedAt
                ? { ...lesson, completedAt, updatedAt: completedAt }
                : lesson,
            ]),
          ),
        };
      });
  }
  function skipBlock() {
    if (!viewedRun || !guidedBlock) return;
    changeLearning((current) => {
      const blockSession = guidedBlock.sessionId && current.sessions[guidedBlock.sessionId];
      const prepared =
        blockSession &&
        blockSession.subject === guidedBlock.subject &&
        blockSession.topicId === guidedBlock.topicId &&
        !blockSession.completedAt
          ? finishSession(current, blockSession.id)
          : current;
      let next = {
        ...prepared,
        planning: skipStudyBlock(prepared.planning!, viewedRun.id, guidedBlock.id, prepared),
      };
      const pending = next.planning.runs[viewedRun.id].blocks.find(
        (block) => block.status === 'pending',
      );
      return pending
        ? enterDailyBlock(next, viewedRun.id, pending.id).state
        : finishDailyLearning(next, viewedRun.id, false);
    });
  }
  function changeTodayMinutes(minutes: number) {
    changeLearning((current) => refitStudyDay(current, today, minutes));
  }
  const pageLabels: Record<Page, string> = {
    school: schoolViewNames[state.school?.view || 'today'],
    home: 'Сегодня',
    plan: 'План подготовки',
    curriculum: 'Темы ЕГЭ',
    'exam-workshop': 'Как решать ЕГЭ',
    study: 'Занятие по плану',
    resources: 'Мои материалы',
    problem: 'Своя задача',
    practice: 'Локальная практика',
    room: 'Учебная комната',
    hq: 'Мой прогресс',
    documents: 'Конспекты и документы',
    memory: 'Моя память',
    settings: 'Настройки',
    backgrounds: 'Фоны',
    knowledge: 'Учебные карточки',
    checkin: 'Стартовая диагностика',
    homework: 'Домашняя практика',
    'homework-desk': 'Домашние задания',
  };
  const navItems = [
    { id: 'home' as Page, label: 'Сегодня', icon: Home },
    { id: 'plan' as Page, label: 'План', icon: CalendarDays },
    { id: 'curriculum' as Page, label: 'Темы ЕГЭ', icon: BookOpen },
    { id: 'resources' as Page, label: 'Материалы', icon: Library },
  ];
  return (
    <PreferencesContext.Provider value={state.settings}>
      <div
        className={`app-shell cosmos-studio ${(page === 'room' && sessionId) || (page === 'study' && guidedBlock?.sessionId) ? 'lesson-active' : ''} ${((page === 'room' && sessionId) || (page === 'study' && guidedBlock?.sessionId)) && state.settings.focusMode ? 'focus-mode' : ''} bg-${state.settings.background === 'quiet' ? 'quiet' : 'cosmos'}`}
      >
        <ImportedBackdrop settings={state.settings} home={page === 'home' || (page === 'school' && state.school?.view === 'today')} />
        <InterfaceEffects
          settings={state.settings}
          routeKey={`${page}:${subject}:${sessionId ?? ''}`}
        />
        <StudioNavigation
          page={page}
          subject={subject}
          name={state.profile.name}
          title={pageLabels[page]}
          onNavigate={navigate}
          onRoom={openRoom}
          onSearch={searchCurrentMode}
          schoolMode={schoolMode}
          schoolGrade={state.school?.grade || 10}
          schoolView={state.school?.view || 'today'}
          onMode={switchMode}
          onSchoolView={schoolNavigate}
          history={
            page === 'homework-desk'
              ? Object.values(state.homeworkDesk?.lessons || {}).map((l) => ({
                  id: `hw:${l.id}`,
                  title: l.title,
                  subtitle: `${getSchoolSubject(l.subject).title} · Домашняя работа`,
                  updatedAt: l.updatedAt,
                  completed: !!l.completedAt,
                }))
              : schoolMode
                ? Object.values(state.school?.lessons || {}).map((l) => ({
                    id: l.id,
                    title: l.focus || l.title,
                    subtitle: `${getSchoolSubject(l.subject).title} · ${l.grade} класс`,
                    updatedAt: l.updatedAt,
                    completed: !!l.completedAt,
                  }))
                : Object.values(state.cloudSessions || {}).map((l) => ({
                    id: l.id,
                    title: l.title,
                    subtitle: subjects.find((s) => s.id === l.subject)?.title || '',
                    updatedAt: l.updatedAt,
                    completed: !!l.completedAt,
                  }))
          }
          onResume={(id) => {
            if (id.startsWith('hw:')) {
              setState((s) => ({
                ...s,
                homeworkDesk: {
                  ...(s.homeworkDesk || createSchoolState()),
                  view: 'room',
                  activeLessonId: id.slice(3),
                },
              }));
              navigate('homework-desk');
              return;
            }
            if (!schoolMode) {
              continueCloud(id);
              return;
            }
            const lesson = state.school?.lessons[id];
            if (!lesson) return;
            setState((s) => ({
              ...s,
              school: {
                ...(s.school || createSchoolState()),
                activeLessonId: id,
                subject: lesson.subject,
                grade: lesson.grade,
                view: 'room',
                enabled: true,
              },
            }));
            navigate('school');
          }}
          onConnect={() => setAuthOpen(true)}
          connected={ai.status.authenticated === true}
        />
        <main className={`main-content studio-page studio-secondary ${page}-page`}>
          {ready && page === 'homework-desk' && (
            <HomeworkDesk
              desk={state.homeworkDesk || createSchoolState()}
              update={(fn) =>
                setState((s) => ({ ...s, homeworkDesk: fn(s.homeworkDesk || createSchoolState()) }))
              }
              settings={state.settings}
              name={state.profile.name}
              ai={ai}
              onConnect={() => setAuthOpen(true)}
              notify={setNotice}
            />
          )}
          {ready &&
            !schoolMode &&
            !['home', 'room', 'curriculum', 'school', 'homework-desk'].includes(page) && (
              <div className="workspace-trail">
                <button className="text-button" onClick={goBack}>
                  <ArrowLeft size={15} /> Назад
                </button>
                <span>/</span>
                <button className="text-button" onClick={() => navigate('home')}>
                  Сегодня
                </button>
                <span>/ {pageLabels[page]}</span>
                {['room', 'checkin', 'homework'].includes(page) && (
                  <span>{subjects.find((s) => s.id === subject)?.title}</span>
                )}
              </div>
            )}
          {ready && !schoolMode && activeRun && page === 'home' && (
            <div className="study-banner">
              <Play size={21} />
              <div>
                <strong>Твоё занятие сохранено</strong>
                <span>
                  {activeRun.blocks.find((block) => block.id === activeRun.activeBlockId)?.title ||
                    'Следующий шаг по плану'}{' '}
                  · {activeRun.status === 'paused' ? 'на паузе' : 'можно продолжить'}
                </span>
              </div>
              <button
                className="button primary"
                onClick={() => {
                  setStudyRunId(activeRun.id);
                  navigate('study');
                }}
              >
                Вернуться к занятию <ArrowRight size={17} />
              </button>
            </div>
          )}
          {!ready ? (
            <div className="startup">
              <Orbit size={42} />
              <h1>Открываем твой космос</h1>
            </div>
          ) : (
            <>
              {page === 'school' && (
                <SchoolWorkspace
                  state={state}
                  setState={setState}
                  ai={ai}
                  onConnect={() => setAuthOpen(true)}
                  notify={setNotice}
                  searchSignal={schoolSearch}
                />
              )}
              {page === 'problem' && (
                <ProblemWorkspace
                  state={state}
                  setState={setState}
                  initialText={problemSeed}
                  initialImage={problemImage}
                  onClose={goBack}
                  notify={setNotice}
                />
              )}
              {page === 'home' && (
                <StudioHome
                  state={state}
                  onSettings={(patch) => setState(s => ({ ...s, settings: { ...s.settings, ...patch } }))}
                  onRoom={openRoom}
                  onContinue={continueCloud}
                  onStart={() => startDay()}
                  onPlan={() => navigate('plan')}
                  onCatalog={() => openCurriculum()}
                  onDocument={() => navigate('documents')}
                  onCheckin={() => {
                    const t = getGradeRoute(
                      subject,
                      10,
                      state.planning?.preferences.mathLevel ?? 'basic',
                    )[0];
                    if (t) startCloud(t, 'diagnostic');
                  }}
                  onMinutes={(n) =>
                    changeLearning((s) => {
                      const next = refitStudyDay(s, today, n);
                      return { ...next, profile: { ...next.profile, dailyMinutes: n } };
                    })
                  }
                />
              )}
              {page === 'plan' && (
                <StudyCalendar
                  state={state}
                  setState={setState}
                  notify={setNotice}
                  view={workspace}
                  onView={(view) => setState((current) => ({ ...current, studyWorkspace: view }))}
                  onCatalog={(date) => openCurriculum(undefined, date)}
                  onStart={startDay}
                  onSchool={(input) => changeLearning((current) => addSchoolToDay(current, input))}
                  onTopic={(id) => openCurriculum(id)}
                />
              )}
              {page === 'curriculum' && (
                <StudioCatalog
                  state={state}
                  onSkip={(topicId, skipped) =>
                    changeLearning((s) => setEgeTopicSkipped(s, topicId, skipped))
                  }
                  onOpen={startCloud}
                  onPractice={begin}
                  onAdd={(t) => {
                    const node = curriculumNodes.find((n) => n.id === t.curriculumNodeIds[0]);
                    if (node) {
                      changeLearning((s) =>
                        addCurriculumToDay(s, node, workspace.planDate || today, 25),
                      );
                      setNotice('Тема добавлена в выбранный день плана.');
                    }
                  }}
                />
              )}
              {page === 'exam-workshop' && (
                <ExamWorkshop initialSubject={subject} onStart={startExamTraining} />
              )}
              {page === 'study' &&
                (viewedRun ? (
                  <StudioDay
                    state={state}
                    setState={setState}
                    run={viewedRun}
                    ai={ai}
                    onConnect={() => setAuthOpen(true)}
                    onStart={startCloud}
                    onPractice={begin}
                    onCatalog={() => openCurriculum()}
                    onPlan={() => navigate('plan')}
                    onNext={nextBlock}
                    onSkip={skipBlock}
                    onFinish={finishDay}
                    onPause={() =>
                      changeLearning((current) => ({
                        ...current,
                        planning:
                          viewedRun.status === 'paused'
                            ? resumeStudyDay(current.planning!, viewedRun.id)
                            : pauseStudyDay(current.planning!, viewedRun.id),
                      }))
                    }
                    onEnter={enterBlock}
                    onContinue={continueCloud}
                    notify={setNotice}
                  />
                ) : (
                  <div className="studio-card">
                    <h1>Составим сегодняшнее занятие</h1>
                    <button className="button primary" onClick={() => startDay()}>
                      Начать сегодняшнее занятие
                    </button>
                  </div>
                ))}
              {page === 'resources' && (
                <section className="study-space materials-hub">
                  <Heading
                    eyebrow="ВСЁ СОХРАНЁННОЕ — ПО СВОИМ МЕСТАМ"
                    title="Мои материалы"
                    description="Выбери, с чем хочешь поработать. Каждый раздел открывается отдельно."
                  />
                  <div className="materials-grid">
                    {[
                      {
                        page: 'documents' as Page,
                        title: 'Конспекты и документы',
                        description: 'Создать, отредактировать или открыть сохранённый документ.',
                        detail: `${state.documents.length} сохранено`,
                        icon: FileText,
                        color: 'purple',
                      },
                      {
                        page: 'knowledge' as Page,
                        title: 'Учебные карточки',
                        description: 'Короткие объяснения, примеры, самопроверка и источники.',
                        detail: 'Локальная база знаний',
                        icon: BookOpen,
                        color: 'cyan',
                      },
                      {
                        page: 'homework' as Page,
                        title: 'Домашняя практика',
                        description: 'Выданные задания, твои ответы и повторение.',
                        detail: `${pendingHomework.length} работ ждут`,
                        icon: ClipboardList,
                        color: 'amber',
                      },
                      {
                        page: 'hq' as Page,
                        title: 'Мой прогресс',
                        description: 'Проверенные попытки, ошибки и темы для возвращения.',
                        detail: 'По каждому предмету',
                        icon: TrendingUp,
                        color: 'green',
                      },
                    ].map((item) => (
                      <button
                        className={`material-destination ${item.color}`}
                        key={item.page}
                        onClick={() => navigate(item.page)}
                      >
                        <IconBadge color={item.color}>
                          <item.icon size={28} />
                        </IconBadge>
                        <h2>{item.title}</h2>
                        <p>{item.description}</p>
                        <span>
                          {item.detail}
                          <ArrowRight size={18} />
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {page === 'room' && (
                <CloudRoom
                  key={subject}
                  state={state}
                  setState={setState}
                  subject={subject}
                  lessonId={cloudId}
                  ai={ai}
                  onConnect={() => setAuthOpen(true)}
                  onStart={startCloud}
                  onSelect={setCloudId}
                  onCatalog={() => openCurriculum()}
                  onPractice={begin}
                  notify={setNotice}
                />
              )}
              {page === 'practice' && (
                <Room
                  key={`${subject}:${sessionId || 'overview'}`}
                  state={state}
                  setState={setState}
                  subject={subject}
                  sessionId={sessionId}
                  setSessionId={setSessionId}
                  begin={begin}
                  notify={setNotice}
                  modelAvailable={model.available}
                  openProblem={openProblem}
                  openCatalog={() => openCurriculum()}
                  openKnowledge={(id) => {
                    navigate('knowledge');
                    setKnowledgeId(id);
                  }}
                  openDocument={(id) => {
                    navigate('documents');
                    setDocumentSessionId(id);
                    window.scrollTo({ top: 0 });
                  }}
                  openCheckin={() => navigate('checkin')}
                  openHomework={(id) => {
                    navigate('homework');
                    setHomeworkSessionId(id);
                    window.scrollTo({ top: 0 });
                  }}
                />
              )}
              {page === 'hq' && (
                <Headquarters
                  state={state}
                  setState={setState}
                  begin={begin}
                  openMemory={() => navigate('memory')}
                  onPlan={() => navigate('plan')}
                />
              )}
              {page === 'documents' && (
                <Documents
                  state={state}
                  setState={setState}
                  notify={setNotice}
                  initialSessionId={documentSessionId}
                />
              )}
              {page === 'knowledge' && (
                <KnowledgeLibrary initialCardId={knowledgeId} onBegin={begin} />
              )}
              {page === 'checkin' && (
                <LearningCheckin
                  state={state}
                  onChange={setState}
                  subject={subject}
                  onClose={() => navigate(activeRun ? 'study' : 'plan')}
                  onPlan={() => navigate('plan')}
                  onOpenLesson={begin}
                />
              )}
              {page === 'homework' && (
                <Homework
                  state={state}
                  onChange={setState}
                  subject={subject}
                  sourceSessionId={homeworkSessionId}
                  onOpenLesson={begin}
                />
              )}
              {page === 'memory' && <Memory state={state} setState={setState} notify={setNotice} />}
              {(page === 'settings' || page === 'backgrounds') && (
                <Settings
                  connected={ai.status.authenticated === true}
                  onConnect={() => setAuthOpen(true)}
                  page={page}
                  state={state}
                  setState={setState}
                  notify={setNotice}
                  model={model}
                  saveError={saveError}
                />
              )}
            </>
          )}
        </main>
        {authOpen && <OpenAIConnection ai={ai} onClose={() => setAuthOpen(false)} />}
        {page === 'home' && <footer className="app-footer">
          <span>
            <Orbit size={14} />
            COSMOS · учиться с пониманием
          </span>
          <button onClick={() => (schoolMode ? schoolNavigate('memory') : navigate('memory'))}>
            <Brain size={14} />
            Что приложение помнит обо мне?
          </button>
          <span className="small">
            {saveError ? 'Есть несохранённые изменения' : 'Прогресс хранится на этом устройстве'}
          </span>
        </footer>}
        {notice && (
          <div className="toast" role="status">
            <Info size={19} />
            {notice}
            <button aria-label="Закрыть уведомление" onClick={() => setNotice('')}>
              <X size={15} />
            </button>
          </div>
        )}
        <QuickJump
          onSchoolTopic={(id) => {
            const topic = getSchoolTopic(id);
            if (topic) startCloud(topic);
          }}
          open={commandOpen && !schoolMode}
          onClose={() => setCommandOpen(false)}
          onPage={navigate}
          onCurriculum={openCurriculum}
          onResume={resume}
          bookmarks={state.bookmarks}
          onTopic={(id) => {
            const active = Object.values(state.sessions)
              .filter((s) => s.topicId === id && !s.completedAt)
              .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
            if (active) {
              setSessionId(active.id);
              setSubject(active.subject);
              navigate('practice');
            } else begin(id);
          }}
        />
        {onboarding && (
          <div className="modal-backdrop">
            <form
              className="welcome-modal"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                setState((s) => ({
                  ...s,
                  profile: { ...s.profile, name: name.trim().slice(0, 40) },
                }));
                setOnboarding(false);
              }}
            >
              <span className="brand-mark">
                <Orbit size={32} />
              </span>
              <div className="eyebrow">ЗНАКОМСТВО С COSMOS</div>
              <h1>
                У каждого открытия
                <br />
                есть начало.
              </h1>
              <p>
                Я Cosmos. Буду объяснять, задавать вопросы и помогать тебе находить ответы
                самостоятельно.
              </p>
              <label>
                Как к тебе обращаться?
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  placeholder="Твоё имя"
                />
              </label>
              <button type="submit" className="button primary">
                Начнём знакомство
                <ArrowRight size={18} />
              </button>
              <InfoTip text="Материалы работают без входа. Для живого диалога подключи ChatGPT." />
            </form>
          </div>
        )}
      </div>
    </PreferencesContext.Provider>
  );
}

type StateProps = {
  state: LearningState;
  setState: React.Dispatch<React.SetStateAction<LearningState>>;
};
function Headquarters({
  state,
  begin,
  openMemory,
  onPlan,
}: StateProps & { begin: (id: string) => void; openMemory: () => void; onPlan: () => void }) {
  const stats = getStats(state);
  return (
    <section className="study-space progress-space">
      <Heading
        eyebrow="ТОЛЬКО СОХРАНЁННЫЕ РЕЗУЛЬТАТЫ"
        title="Мой прогресс"
        description="Самостоятельные ответы, ошибки и повторения. Чтение темы не считается её освоением."
        action={
          <button className="button primary" onClick={onPlan}>
            К плану подготовки <ArrowRight size={17} />
          </button>
        }
      />
      <div className="study-report-metrics">
        <div>
          <strong>{stats.totalAttempts}</strong>
          <span>проверенных попыток</span>
        </div>
        <div>
          <strong>{stats.independentCorrect}</strong>
          <span>самостоятельно верных</span>
        </div>
        <div>
          <strong>{stats.completedSessions}</strong>
          <span>занятий с итогом</span>
        </div>
        <div>
          <strong>{stats.streak}</strong>
          <span>дней подряд</span>
        </div>
      </div>
      <div className="materials-grid">
        {subjects.map((subject) => {
          const progress = stats.bySubject[subject.id],
            Icon = subjectIcons[subject.id];
          return (
            <article className="study-card" data-subject={subject.id} key={subject.id}>
              <Icon size={28} />
              <h2>{subject.title}</h2>
              <p>
                {progress.attempts
                  ? `${progress.correct} верных из ${progress.attempts} проверенных попыток.`
                  : 'Проверенных попыток пока нет.'}
              </p>
              <p className="small muted">
                Подтверждено навыков в доступных уроках: {progress.masteredTopics} из{' '}
                {progress.totalTopics}. <InfoTip text="Это не процент всего курса ЕГЭ." />
              </p>
              <details>
                <summary>Темы, к которым стоит вернуться</summary>
                {[
                  ...new Map(
                    [...stats.weakTopics, ...stats.dueTopics]
                      .filter((topic) => topic.subject === subject.id)
                      .map((topic) => [topic.id, topic]),
                  ).values(),
                ].map((topic) => (
                  <button
                    className="text-button progress-topic"
                    key={topic.id}
                    onClick={() => begin(topic.id)}
                  >
                    {topic.title}
                    <ArrowRight size={15} />
                  </button>
                ))}
                {!stats.weakTopics.some((topic) => topic.subject === subject.id) &&
                  !stats.dueTopics.some((topic) => topic.subject === subject.id) && (
                    <p className="small muted">
                      После проверенных ответов здесь появятся рекомендации.
                    </p>
                  )}
              </details>
            </article>
          );
        })}
      </div>
      <button className="text-button" onClick={openMemory}>
        Что Cosmos помнит обо мне <Brain size={17} />
      </button>
    </section>
  );
}

function Memory({ state, setState, notify }: StateProps & { notify: (s: string) => void }) {
  const [draft, setDraft] = useState(state.profile.name);
  const [fact, setFact] = useState('');
  const [factSubject, setFactSubject] = useState<SubjectId | 'all'>('all');
  return (
    <>
      <Heading
        eyebrow="ПАМЯТЬ, КОТОРАЯ ПОД ТВОИМ КОНТРОЛЕМ"
        title="Что Cosmos помнит обо мне?"
        description="Здесь только учебные сведения. Ты можешь исправить их в любой момент."
      />
      <div className="memory-layout">
        <section className="panel">
          <IconBadge>
            <Brain size={25} />
          </IconBadge>
          <h2>Знакомство</h2>
          <label>
            Твоё имя
            <input value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} />
          </label>
          <button
            className="button primary"
            onClick={() => {
              if (draft.trim()) {
                setState((s) => ({
                  ...s,
                  profile: { ...s.profile, name: draft.trim() },
                }));
                notify('Имя обновлено.');
              }
            }}
          >
            Сохранить имя
            <Check size={16} />
          </button>
          <h3>Мои предметы</h3>
          <div className="subject-checkboxes">
            {subjects.map((s) => (
              <label key={s.id}>
                <input
                  type="checkbox"
                  checked={state.profile.selectedSubjects.includes(s.id)}
                  onChange={() =>
                    setState((old) => ({
                      ...old,
                      profile: {
                        ...old.profile,
                        selectedSubjects: old.profile.selectedSubjects.includes(s.id)
                          ? old.profile.selectedSubjects.filter((id) => id !== s.id)
                          : [...old.profile.selectedSubjects, s.id],
                      },
                    }))
                  }
                />
                {s.title}
              </label>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>Как мне удобнее учиться</h2>
          <p>Например: «Объяснять короткими шагами» или «Повторять формулы перед задачей».</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (fact.trim()) {
                setState((s) => ({
                  ...s,
                  facts: [
                    ...s.facts,
                    {
                      id: crypto.randomUUID(),
                      subject: factSubject,
                      origin: 'student',
                      text: fact.trim(),
                      createdAt: new Date().toISOString(),
                    },
                  ] as typeof s.facts,
                }));
                setFact('');
              }
            }}
          >
            <label>
              Относится к
              <select
                value={factSubject}
                onChange={(e) => setFactSubject(e.target.value as SubjectId | 'all')}
              >
                <option value="all">Все занятия</option>
                {subjects.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="inline-input">
              <input
                value={fact}
                onChange={(e) => setFact(e.target.value)}
                maxLength={300}
                placeholder="Добавить учебное предпочтение"
              />
              <button className="button secondary" type="submit" aria-label="Добавить учебное предпочтение" title="Добавить учебное предпочтение">
                <Plus size={19} />
              </button>
            </div>
          </form>
          <div className="fact-list">
            {state.facts.map((f: any) => (
              <div key={f.id}>
                <div>
                  <span className="small muted">
                    {subjects.find((s) => s.id === f.subject)?.title || 'Все занятия'}
                    {f.origin === 'model-summary' ? ' · предварительное наблюдение модели' : ''}
                  </span>
                  <input
                    aria-label="Учебный факт"
                    defaultValue={f.text}
                    onBlur={(e) => {
                      const text = e.target.value.trim();
                      if (text)
                        setState((s) => ({
                          ...s,
                          facts: s.facts.map((x) => (x.id === f.id ? { ...x, text } : x)),
                        }));
                    }}
                  />
                </div>
                <button
                  className="icon-button"
                  aria-label={`Удалить факт ${f.text}`}
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      facts: s.facts.filter((x: any) => x.id !== f.id),
                    }))
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <InfoTip text="Предметы хранят отдельные занятия. Технические ошибки не попадают в учебные факты." />
        </section>
      </div>
      <section className="panel">
        <h2>Учебные факты по предметам</h2>
        <div className="memory-subjects">
          {subjects.map((s) => (
            <div key={s.id}>
              <h3>{s.title}</h3>
              <p>
                {Object.values(state.sessions).filter((x) => x.subject === s.id).length} занятий ·{' '}
                {topics
                  .filter((t) => t.subject === s.id)
                  .reduce((n, t) => n + topicStatus(state, t.id).attempts.length, 0)}{' '}
                попыток
              </p>
              <details className="memory-observations">
                <summary>Диагностика и домашние задания</summary>
                <p>{diagnosticMemory(state, s.id) || 'Короткая диагностика ещё не завершена.'}</p>
                <p>{homeworkMemory(state, s.id) || 'Домашних заданий пока нет.'}</p>
              </details>
              <button
                className="text-button"
                onClick={() => {
                  setState((old) => clearSubjectHistory(old, s.id));
                  notify(`Учебная история «${s.title}» очищена.`);
                }}
              >
                Сбросить учебную историю
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
