import type { ViewId } from '../shared/types';

export interface NavigationItem {
  id: ViewId;
  label: string;
  eyebrow: string;
  title: string;
  subtitle: string;
}

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    eyebrow: 'COMMAND OVERVIEW',
    title: 'Dashboard',
    subtitle: 'Live runtime diagnostics and assistant state.',
  },
  {
    id: 'chat',
    label: 'AI Chat',
    eyebrow: 'CONVERSATION ENGINE',
    title: 'AI Chat',
    subtitle: 'Provider-independent conversation workspace.',
  },
  {
    id: 'pc-control',
    label: 'PC Control',
    eyebrow: 'SYSTEM CONTROL SURFACE',
    title: 'PC Control',
    subtitle: 'Permission-gated Windows automation status.',
  },
  {
    id: 'automation',
    label: 'Automation',
    eyebrow: 'WORKFLOW ENGINE',
    title: 'Automation',
    subtitle: 'Scheduled and event-driven workflows.',
  },
  {
    id: 'developer-hub',
    label: 'Developer Hub',
    eyebrow: 'DEVELOPER WORKSPACE',
    title: 'Developer Hub',
    subtitle: 'Codebase, Git, tests and build diagnostics.',
  },
  {
    id: 'knowledge',
    label: 'Knowledge Base',
    eyebrow: 'DOCUMENT INDEX',
    title: 'Knowledge Base',
    subtitle: 'Indexed files and searchable document memory.',
  },
  {
    id: 'productivity',
    label: 'Productivity',
    eyebrow: 'PERSONAL ASSISTANT',
    title: 'Productivity',
    subtitle: 'Tasks, reminders, focus and usage insights.',
  },
  {
    id: 'settings',
    label: 'Settings',
    eyebrow: 'RUNTIME & SECURITY',
    title: 'Settings',
    subtitle: 'Application diagnostics and security baseline.',
  },
] as const;

export function getNavigationItem(id: ViewId): NavigationItem {
  const item = NAVIGATION_ITEMS.find((entry) => entry.id === id);
  if (!item) {
    throw new Error(`Unknown navigation view: ${id}`);
  }
  return item;
}
