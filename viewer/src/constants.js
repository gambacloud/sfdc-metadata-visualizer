export const C = {
  bg:       '#080d18',
  panel:    '#0f1624',
  panel2:   '#111827',
  border:   '#1e2d45',
  border2:  '#2d4a6e',
  accent:   '#00d4ff',   // Flow / cyan
  accent2:  '#ff6b35',   // Trigger / orange
  accent3:  '#7c3aed',   // ApexClass / violet
  accent4:  '#10b981',   // CustomObject / green
  accent5:  '#f59e0b',   // PlatformEvent / amber
  accent6:  '#ec4899',   // LWC / pink
  accent7:  '#6366f1',   // Aura / indigo
  text:     '#e2e8f0',
  muted:    '#64748b',
  muted2:   '#94a3b8',
  success:  '#10b981',
  warning:  '#f59e0b',
  danger:   '#ef4444',
  inferred: '#f59e0b',
  external: '#6b7280',
};

export const TYPE_COLOR = {
  Flow:          C.accent,
  Trigger:       C.accent2,
  ApexClass:     C.accent3,
  CustomObject:  C.accent4,
  PlatformEvent: C.accent5,
  LWC:           C.accent6,
  Aura:          C.accent7,
};

export const TYPE_ICON = {
  Flow:          '⚡',
  Trigger:       '🔁',
  ApexClass:     '{}',
  CustomObject:  '🗄',
  PlatformEvent: '📡',
  LWC:           '🧩',
  Aura:          '🌩',
};

export const EDGE_LABELS = {
  'handler-call':    'handler',
  'class-call':      'calls',
  'dml-triggers':    'DML →',
  'event-publish':   'publishes',
  'event-subscribe': 'subscribes',
  'flow-subflow':    'subflow',
  'flow-apex':       'apex action',
  'flow-dml':        'writes',
  'lwc-apex':        '@wire',
  'lwc-flow':        'embeds flow',
  'lwc-child':       'child',
  'aura-apex':       'controller',
  'aura-flow':       'embeds flow',
  'aura-child':      'child',
  'batch-call':      'batch',
  'queueable-call':  'enqueue',
  'future-call':     '@future',
  'rest-callout':    'callout',
  'extends':         'extends',
  'flow-invoke':     'invokes flow',
};

export const EDGE_COLOR = {
  'handler-call':    C.accent2,
  'class-call':      C.accent3,
  'dml-triggers':    C.warning,
  'event-publish':   C.accent5,
  'event-subscribe': C.accent5,
  'flow-subflow':    C.accent,
  'flow-apex':       C.accent,
  'lwc-apex':        C.accent6,
  'lwc-flow':        C.accent6,
  'aura-apex':       C.accent7,
  'aura-flow':       C.accent7,
  'batch-call':      C.accent3,
  'queueable-call':  C.accent3,
  'rest-callout':    C.external,
  'extends':         C.muted,
  'flow-invoke':     C.accent,
};
