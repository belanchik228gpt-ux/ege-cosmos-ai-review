import { FileText } from 'lucide-react';

/** A decorative cover of the actual saved document; it is not a page screenshot. */
export function StudioDocumentCover({ title, kind }: { title: string; kind: string }) {
  return (
    <span className="studio-document-cover" aria-hidden="true">
      <span className="studio-document-kind">{kind}</span>
      <span className="studio-mini-paper">
        <FileText size={19} />
        <b>{title}</b>
        <i />
        <i />
        <i />
        <span />
        <i />
        <i />
      </span>
    </span>
  );
}
