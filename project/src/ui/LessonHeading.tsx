import { TutorMarkdown } from './TutorMarkdown';

export function LessonHeading({ title }: { title: string }) {
  const [course, ...parts] = title.split(' · ');
  return (
    <div className="lesson-heading">
      {parts.length > 0 && (
        <div className="studio-eyebrow">
          <TutorMarkdown text={course} inline />
        </div>
      )}
      <h1>
        <TutorMarkdown text={parts.length ? parts.join(' · ') : title} inline />
      </h1>
    </div>
  );
}
