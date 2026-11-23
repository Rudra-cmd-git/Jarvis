import { useState } from 'react';
import { ControlProvider } from './state/control-context';
import { CoreProvider, useCore } from './state/core-context';
import { RuntimeProvider, useRuntime } from './state/runtime-context';
import { VoiceProvider } from './state/voice-context';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { StatusBar } from './components/layout/StatusBar';
import { Dashboard } from './views/Dashboard';
import { ChatView } from './views/Chat';
import { PcControlView } from './views/PcControl';
import { AutomationView } from './views/Automation';
import { DeveloperHubView } from './views/DeveloperHub';
import { KnowledgeView } from './views/Knowledge';
import { ProductivityView } from './views/Productivity';
import { SettingsView } from './views/Settings';
import type { ViewId } from '../shared/types';

function ViewRouter({
  viewId,
  onNavigate,
}: {
  viewId: ViewId;
  onNavigate: (view: ViewId) => void;
}) {
  switch (viewId) {
    case 'dashboard':
      return <Dashboard onNavigate={onNavigate} />;
    case 'chat':
      return <ChatView onNavigate={onNavigate} />;
    case 'pc-control':
      return <PcControlView onNavigate={onNavigate} />;
    case 'automation':
      return <AutomationView />;
    case 'developer-hub':
      return <DeveloperHubView onNavigate={onNavigate} />;
    case 'knowledge':
      return <KnowledgeView />;
    case 'productivity':
      return <ProductivityView />;
    case 'settings':
      return <SettingsView onNavigate={onNavigate} />;
    default:
      return <Dashboard onNavigate={onNavigate} />;
  }
}

export function App() {
  const [activeView, setActiveView] = useState<ViewId>('dashboard');

  return (
    <RuntimeProvider>
      <CoreProvider>
        <ControlProvider>
          <VoiceProvider>
            <RuntimeShell activeView={activeView} onNavigate={setActiveView} />
          </VoiceProvider>
        </ControlProvider>
      </CoreProvider>
    </RuntimeProvider>
  );
}

function RuntimeShell({
  activeView,
  onNavigate,
}: {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
}) {
  const { appInfo, error } = useRuntime();
  const { settings } = useCore();
  const shellClasses = [
    'app-shell',
    settings['ui.compactSidebar'] ? 'app-shell--compact' : '',
    settings['ui.reduceMotion'] ? 'app-shell--reduce-motion' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClasses} data-reduce-motion={settings['ui.reduceMotion'] ? 'true' : 'false'}>
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="ambient ambient--two" aria-hidden="true" />
      <div className="grid-overlay" aria-hidden="true" />
      <Sidebar
        activeView={activeView}
        onNavigate={onNavigate}
        version={appInfo?.appVersion ?? '0.1.0'}
        bridgeOnline={!error}
      />
      <div className="workspace">
        <TopBar viewId={activeView} />
        <div className="view-scroll">
          <ViewRouter viewId={activeView} onNavigate={onNavigate} />
        </div>
        <StatusBar />
      </div>
    </div>
  );
}


