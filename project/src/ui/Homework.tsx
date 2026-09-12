import { useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, ClipboardList, Plus, RotateCcw } from 'lucide-react';
import type { LearningState, SubjectId } from '../domain/types';
import { subjects } from '../domain/catalog';
import { practiceId } from '../domain/diagnostics';
import {
  advanceHomework,
  answerHomework,
  createHomework,
  getSubjectHomework,
  hintHomework,
  repeatHomework,
} from '../domain/homework';
import { PracticeConversation, PracticeSummaryView } from './LearningCheckin';
import './learning-tools.css';
import './reading-flow.css';

export interface HomeworkProps {
  state: LearningState;
  onChange: (state: LearningState) => void;
  subject: SubjectId;
  sourceSessionId?: string;
  onOpenLesson?: (topicId: string) => void;
}
export function Homework({
  state,
  onChange,
  subject,
  sourceSessionId,
  onOpenLesson,
}: HomeworkProps) {
  const [selectedSubject, setSelectedSubject] = useState(subject);
  const [selectedId, setSelectedId] = useState('');
  useEffect(() => {
    setSelectedSubject(subject);
    setSelectedId('');
  }, [subject, sourceSessionId]);
  const assignments = getSubjectHomework(state, selectedSubject);
  const sourceAssignment = sourceSessionId
    ? assignments.find((assignment) => assignment.sourceSessionId === sourceSessionId)
    : undefined;
  const assignment =
    assignments.find((candidate) => candidate.id === selectedId) ??
    sourceAssignment ??
    assignments[0];
  const currentItem = assignment?.items[assignment.currentIndex];
  function create() {
    const validSource =
      sourceSessionId && state.sessions[sourceSessionId]?.subject === selectedSubject
        ? sourceSessionId
        : undefined;
    const result = createHomework(state, selectedSubject, validSource);
    setSelectedId(result.assignmentId);
    onChange(result.state);
  }
  return (
    <section
      className={`homework-page learning-tools flow-homework subject-${selectedSubject}`}
      aria-label="Домашние задания"
    >
      <header className="practice-page-heading">
        <div>
          <span className="eyebrow">НЕБОЛЬШОЙ ШАГ МЕЖДУ ЗАНЯТИЯМИ</span>
          <h1>Домашняя работа</h1>
          <p>Cosmos помнит выданные задания, результаты и день повторения.</p>
        </div>
        {assignment && (
          <button type="button" className="button secondary" onClick={create}>
            <Plus size={17} />
            Новая работа
          </button>
        )}
      </header>
      <div className="tabs practice-subject-tabs" aria-label="Предмет домашних заданий">
        {subjects.map((candidate) => (
          <button
            type="button"
            key={candidate.id}
            className={`subject-${candidate.id} ${selectedSubject === candidate.id ? 'active' : ''}`}
            onClick={() => {
              setSelectedSubject(candidate.id);
              setSelectedId('');
            }}
          >
            {candidate.title}
          </button>
        ))}
      </div>
      {!assignment ? (
        <div className="practice-start">
          <div className="practice-start-icon">
            <ClipboardList size={34} />
          </div>
          <h3>Для этого предмета работа ещё не назначена</h3>
          <p>
            Подберём три небольших задания из учебного каталога. Если уже была диагностика, начнём с
            навыков, которым нужна практика.
          </p>
          <button type="button" className="button primary" onClick={create}>
            Подобрать три задания
            <ArrowRight size={17} />
          </button>
          <span className="practice-limit">
            Тренировочный материал Cosmos. При повторении могут встретиться знакомые задачи.
          </span>
        </div>
      ) : (
        <div className="homework-layout">
          <details className="flow-homework-archive flow-disclosure">
            <summary>
              Мои работы <span>{assignments.length}</span>
            </summary>
            <aside className="homework-list" aria-label="Сохранённые домашние работы">
              {assignments.map((candidate) => (
                <button
                  type="button"
                  key={candidate.id}
                  className={candidate.id === assignment.id ? 'selected' : ''}
                  onClick={(event) => {
                    setSelectedId(candidate.id);
                    const details = event.currentTarget.closest('details');
                    if (details) details.open = false;
                  }}
                >
                  <strong>{candidate.title}</strong>
                  <span>
                    {candidate.phase === 'completed'
                      ? 'Итог сохранён'
                      : `Пройдено вопросов ${candidate.responses.length} из ${candidate.items.length}`}
                  </span>
                  <small>
                    {candidate.phase === 'completed' && candidate.repeatAt
                      ? `Повторение ${new Date(candidate.repeatAt).toLocaleDateString('ru-RU')}`
                      : `К ${new Date(candidate.dueAt).toLocaleDateString('ru-RU')}`}
                  </small>
                </button>
              ))}
            </aside>
          </details>
          <div className="homework-current">
            <div className="homework-assignment-title">
              <div>
                <h2>{assignment.title}</h2>
                <p>
                  <CalendarClock size={16} />
                  {assignment.phase === 'completed' && assignment.repeatAt
                    ? `Повторение ${new Date(assignment.repeatAt).toLocaleDateString('ru-RU')}`
                    : `Запланировано к ${new Date(assignment.dueAt).toLocaleDateString('ru-RU')}`}
                </p>
              </div>
              <span className="mini-tag">{assignment.items.length} задания</span>
            </div>
            <PracticeConversation
              record={assignment}
              name={state.profile.name}
              inputLabel="Мой ответ в домашней работе"
              onAnswer={(text, id) => {
                if (currentItem)
                  onChange(answerHomework(state, assignment.id, currentItem.id, text, id));
              }}
              onHint={() => onChange(hintHomework(state, assignment.id))}
              onAdvance={() => onChange(advanceHomework(state, assignment.id))}
              onSkip={() => {
                if (currentItem)
                  onChange(
                    answerHomework(
                      state,
                      assignment.id,
                      currentItem.id,
                      '',
                      practiceId('skip'),
                      undefined,
                      true,
                    ),
                  );
              }}
            />
            {assignment.summary && (
              <>
                <PracticeSummaryView
                  summary={assignment.summary}
                  subject={selectedSubject}
                  onOpenLesson={onOpenLesson}
                />
                <div className="practice-completed-actions">
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => {
                      const result = repeatHomework(state, assignment.id);
                      setSelectedId(result.assignmentId);
                      onChange(result.state);
                    }}
                  >
                    <RotateCcw size={17} />
                    Повторить эту работу
                  </button>
                  <span className="practice-limit">
                    Повторение создаёт отдельную работу и сохраняет прежний результат.
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
