import {
  ClipboardList,
  ContactRound,
  DollarSign,
  FileText,
  LayoutDashboard,
  ListChecks,
  Settings,
  UsersRound,
} from 'lucide-react';

export const EVENTS_CACHE_KEY = 'events-app-2.0:last-sheet-events';

export const navItems = [
  { id: 'events', label: 'Events', icon: LayoutDashboard },
  { id: 'pricing', label: 'Pricing', icon: DollarSign },
  { id: 'payout', label: 'Payout', icon: ClipboardList },
  { id: 'admin', label: 'Admin', icon: Settings },
];

export const cardActions = [
  { id: 'client', label: 'Client Details', icon: ContactRound },
  { id: 'staff', label: 'Staff Assignments', icon: UsersRound },
  { id: 'notes', label: 'Notes', icon: ListChecks },
  { id: 'files', label: 'Generators & Files', icon: FileText },
];

export const STATUS_OPTIONS = [
  'Post Consult Decision',
  'Need To Send Contract/Deposit Invoice',
  'Contract Signed',
  'Deposit Sent',
  'Deposit Late',
  'Deposit Paid',
  'Temporary License Submitted',
  'Temporary license recieved',
  'Awaiting Follow Up',
  'Needing Changes',
  'Balance Invoice Sent',
  'Cancelled',
  'Not Likely to Continue',
  'Event Complete',
  'Event Complete Balance Late',
];

export const STAFF_OPTIONS = [
  'Tomma',
  'Shy',
  'Megan',
  'Sisi',
  'Drew',
  'Agnes',
  'Lindsay',
  'Jayden',
  'Summer',
  'Anna',
  'Jake',
  'Lucky',
  'Anne',
  'Jazz',
];

export const COUNTER_OPTIONS = [...STAFF_OPTIONS, 'Jacob', 'Jason', 'Kevin', 'Veda', 'None', 'Other'];

export const CLIENT_FIELD_CONFIG = [
  ['year', 'Price Plan', 'select-year'],
  ['clientName', 'Client Name'],
  ['eventDate', 'Date of Event'],
  ['venueName', 'Venue Name'],
  ['eventType', 'Type of Event'],
  ['contactPhone', 'Contact Phone'],
  ['email', 'Email'],
  ['eventAddress', 'Event Address'],
  ['estGuestCount', 'Est Guest Count'],
  ['travelDistance', 'Travel Distance'],
];
