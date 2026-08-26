import { BriefcaseBusiness, Check, Handshake, Heart, PartyPopper, ScrollText } from 'lucide-react';

import { normalizePricingMethod, PRICING_METHOD_CORPORATE_MODIFIERS, PRICING_METHOD_ZERO_WALK_UP } from '../pricingMath.js';
import { CurrencyExchangeIcon, MoneyOffIcon } from './PricingMethodIcons.jsx';

export const EVENT_TYPE_OPTIONS = [
  { value: 'Private', label: 'Private event', icon: PartyPopper, color: '#b58bff' },
  { value: 'Corporate', label: 'Corporate event', icon: BriefcaseBusiness, color: '#c77f6b' },
  { value: 'Wedding', label: 'Wedding', icon: Heart, color: '#d77f98' },
  { value: 'Fundraiser', label: 'Fundraiser', icon: Handshake, color: '#7fd29a' },
  { value: 'Other', label: 'Other event type', icon: ScrollText, color: '#d9ad62' },
];

export const SPECIAL_EVENT_VISUALS = [
  { value: 'Corporate / Walk-Up', label: 'Corporate / Walk-Up', icon: CurrencyExchangeIcon, color: '#8fc9ad' },
  { value: 'Walk-Up Sales Only', label: 'Walk-Up Sales Only', icon: MoneyOffIcon, color: '#a9adb1' },
];

export const EVENT_VISUAL_LEGEND = [...EVENT_TYPE_OPTIONS, ...SPECIAL_EVENT_VISUALS];

export function getEventTypeVisual(eventType) {
  const key = String(eventType || '').trim().toLowerCase();
  return EVENT_TYPE_OPTIONS.find((option) => key.includes(option.value.toLowerCase())) || EVENT_TYPE_OPTIONS.at(-1);
}

export function getEventVisual(eventType, pricingMethod) {
  const normalizedPricingMethod = normalizePricingMethod(pricingMethod);
  if (normalizedPricingMethod === PRICING_METHOD_CORPORATE_MODIFIERS) return SPECIAL_EVENT_VISUALS[0];
  if (normalizedPricingMethod === PRICING_METHOD_ZERO_WALK_UP) return SPECIAL_EVENT_VISUALS[1];
  return getEventTypeVisual(eventType);
}

export function EventTypePicker({ value, onChange, disabled = false }) {
  const selectedOption = getEventTypeVisual(value);
  const selected = selectedOption.value;

  return (
    <div className="event-type-control">
      <p className="event-type-selection" aria-live="polite">
        <span>Type of event:</span> <strong>{value ? selectedOption.label : 'Not selected'}</strong>
      </p>
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
    </div>
  );
}
