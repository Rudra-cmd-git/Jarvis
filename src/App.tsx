import { AppProvider } from "./store/app-context";
import { TtsProvider } from "./voice/tts";
import { ToastProvider } from "./components/ui/Toast";
import { Shell } from "./components/shell/Shell";

export function App() {
  return (
    <ToastProvider>
      <AppProvider>
        <TtsProvider>
          <Shell />
        </TtsProvider>
      </AppProvider>
    </ToastProvider>
  );
}
