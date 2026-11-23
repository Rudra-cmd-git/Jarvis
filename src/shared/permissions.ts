export type PermissionCapability =
  | 'credentials.manage'
  | 'network.request'
  | 'files.read'
  | 'files.write'
  | 'files.delete'
  | 'app.launch'
  | 'system.exec'
  | 'screen.capture'
  | 'microphone.record'
  | 'clipboard.read'
  | 'browser.automate'
  | 'automation.run';

export type PermissionDecision = 'granted' | 'denied';
export type PermissionState = PermissionDecision | 'unset';
export type PermissionRisk = 'low' | 'medium' | 'high';

export interface PermissionDescriptor {
  capability: PermissionCapability;
  label: string;
  description: string;
  risk: PermissionRisk;
  /** Only capabilities that are actually enforced by code may be granted. */
  available: boolean;
  availabilityNote: string;
}

export interface PermissionView extends PermissionDescriptor {
  state: PermissionState;
  updatedAt: number | null;
}

export interface PermissionOverview {
  permissions: PermissionView[];
}

/**
 * Capabilities that are not enforced yet are listed for transparency but
 * cannot be granted. Granting a permission that no code checks would be a
 * fake control, so `available` is the single source of truth for the UI.
 */
export const PERMISSION_CATALOG: readonly PermissionDescriptor[] = [
  {
    capability: 'credentials.manage',
    label: 'Store encrypted API credentials',
    description:
      'Allow JARVIS to save and remove provider API keys through the main-process secret store. Keys are encrypted with Electron safeStorage and never returned to the interface.',
    risk: 'medium',
    available: true,
    availabilityNote: 'Enforced now by the credential IPC handlers.',
  },
  {
    capability: 'network.request',
    label: 'Make outbound network requests',
    description:
      'Allow provider adapters to call the AI endpoints you configure. Requests are made only by the main process and are logged.',
    risk: 'medium',
    available: true,
    availabilityNote: 'Enforced now by the AI provider layer for every outbound request.',
  },
  {
    capability: 'files.read',
    label: 'Read files',
    description: 'Allow JARVIS to read files you explicitly target.',
    risk: 'medium',
    available: false,
    availabilityNote: 'Planned for Phase 2 / Phase 3 file intelligence.',
  },
  {
    capability: 'files.write',
    label: 'Write files',
    description: 'Allow JARVIS to create or modify files.',
    risk: 'high',
    available: false,
    availabilityNote: 'Planned for Phase 2 with confirmation prompts.',
  },
  {
    capability: 'files.delete',
    label: 'Delete files',
    description: 'Allow JARVIS to delete files after explicit confirmation.',
    risk: 'high',
    available: false,
    availabilityNote: 'Planned for Phase 2 with confirmation prompts.',
  },
  {
    capability: 'app.launch',
    label: 'Launch applications',
    description: 'Allow JARVIS to open allowlisted applications.',
    risk: 'medium',
    available: false,
    availabilityNote: 'Planned for Phase 2 (PC control).',
  },
  {
    capability: 'system.exec',
    label: 'Execute system commands',
    description: 'Allow JARVIS to run terminal commands.',
    risk: 'high',
    available: false,
    availabilityNote: 'Not planned as unrestricted execution; Phase 2 will use an allowlist.',
  },
  {
    capability: 'screen.capture',
    label: 'Capture the screen',
    description: 'Allow JARVIS to read screen content for analysis.',
    risk: 'high',
    available: false,
    availabilityNote: 'Planned for Phase 3 with a visible indicator.',
  },
  {
    capability: 'microphone.record',
    label: 'Use the microphone',
    description: 'Allow voice input and wake-word listening.',
    risk: 'high',
    available: false,
    availabilityNote: 'Planned for Phase 2 with a visible indicator.',
  },
  {
    capability: 'clipboard.read',
    label: 'Read the clipboard',
    description: 'Allow JARVIS to read clipboard contents.',
    risk: 'medium',
    available: false,
    availabilityNote: 'Planned for Phase 2.',
  },
  {
    capability: 'browser.automate',
    label: 'Automate the browser',
    description: 'Allow JARVIS to navigate and fill forms.',
    risk: 'high',
    available: false,
    availabilityNote: 'Planned for Phase 3 with submit confirmation.',
  },
  {
    capability: 'automation.run',
    label: 'Run automations',
    description: 'Allow saved workflows to execute.',
    risk: 'high',
    available: false,
    availabilityNote: 'Planned for Phase 4.',
  },
];

export function isPermissionCapability(value: unknown): value is PermissionCapability {
  return (
    typeof value === 'string' && PERMISSION_CATALOG.some((entry) => entry.capability === value)
  );
}

export function getPermissionDescriptor(capability: PermissionCapability): PermissionDescriptor {
  const descriptor = PERMISSION_CATALOG.find((entry) => entry.capability === capability);
  if (!descriptor) {
    throw new Error(`Unknown permission capability: ${capability}`);
  }
  return descriptor;
}
