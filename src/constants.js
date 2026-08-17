import {
  ClipboardList,
  DollarSign,
  FolderOpen,
  Hourglass,
  Info,
  LayoutDashboard,
  Settings,
  UserRoundCog,
} from 'lucide-react';

export const EVENTS_CACHE_KEY = 'events-app-2.0:last-sheet-events';

export const navItems = [
  { id: 'events', label: 'Events', icon: LayoutDashboard },
  { id: 'pricing', label: 'Pricing', icon: DollarSign },
  { id: 'payout', label: 'Payout', icon: ClipboardList },
  { id: 'admin', label: 'Admin', icon: Settings },
];

export const cardActions = [
  { id: 'client', label: 'Client Details', icon: Info },
  { id: 'staff', label: 'Staff Assignments', icon: UserRoundCog },
  { id: 'notes', label: 'Status & Communication', icon: Hourglass },
  { id: 'files', label: 'Generators & Files', icon: FolderOpen },
];

export const STATUS_OPTIONS = [
  'New',
  'Consult Booked/Pending',
  'Post Consult Decision',
  'Need To Send Contract/Deposit Invoice',
  'Contract Signed',
  'Deposit Sent',
  'Deposit Late',
  'Deposit Paid',
  'Temporary License Submitted',
  'Temporary License Received',
  'Awaiting Follow Up',
  'Needing Changes',
  'Balance Invoice Sent',
  'Invoice Paid in Full',
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
  'Sienna',
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
