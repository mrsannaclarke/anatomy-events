import { BriefcaseBusiness, Check, Heart, PartyPopper, ScrollText, Users } from 'lucide-react';

export const EVENT_TYPE_OPTIONS = [
  { value: 'Private', label: 'Private event', icon: PartyPopper, color: '#b58bff' },
  { value: 'Corporate', label: 'Corporate event', icon: BriefcaseBusiness, color: '#6ab7ff' },
  { value: 'Wedding', label: 'Wedding', icon: Heart, color: '#ff7fb8' },
  { value: 'Fundraiser', label: 'Fundraiser', icon: Users, color: '#7fd29a' },
  { value: 'Other', label: 'Other event type', icon: ScrollText, color: '#f1b56f' },
];

export function getEventTypeVisual(eventType) {
  const key = String(eventType || '').trim().toLowerCase();
  return EVENT_TYPE_OPTIONS.find((option) => key.includes(option.value.toLowerCase())) || EVENT_TYPE_OPTIONS.at(-1);
}

export function EventTypePicker({ value, onChange, disabled = false }) {
  const selected = getEventTypeVisual(value).value;

  return (
    <div className="event-type-picker" role="group" aria-label="Type of event">
      {EVENT_TYPE_OPTIONS.map((option) => {
        const Icon = option.icon;
        const isSelected = Boolean(value) && selected === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={isSelected ? 'event-type-choice selected' : 'event-type-choice'}
            style={{ '--event-type-color': option.color }}
            title={option.label}
            aria-label={option.label}
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            <Icon size={20} aria-hidden="true" />
            {isSelected ? <Check className="event-type-choice__check" size={11} strokeWidth={3} aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}
