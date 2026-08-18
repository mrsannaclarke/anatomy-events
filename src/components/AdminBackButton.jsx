import { ArrowLeft } from 'lucide-react';

export function AdminBackButton({ onClick }) {
  return (
    <button type="button" className="secondary-button admin-back-button" onClick={onClick}>
      <ArrowLeft size={16} aria-hidden="true" />
      Admin Tools
    </button>
  );
}
