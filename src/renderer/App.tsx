import { useUiStore } from './store/uiStore';
import { SvgSprites } from './components/icons/SvgSprites';
import { TitleBar } from './components/layout/TitleBar';
import { WindowPanel } from './components/windows/WindowPanel';
import { TargetPanel } from './components/targets/TargetPanel';
import { RulePanel } from './components/rules/RulePanel';
import { Footer } from './components/footer/Footer';
import { useInitApp } from './hooks/useInitApp';
import { useKeepAlive } from './hooks/useKeepAlive';
import { useAutoInject } from './hooks/useAutoInject';
import { useAntiSleep } from './hooks/useAntiSleep';
import { useHookLog } from './hooks/useHookLog';
import { usePersistence } from './hooks/usePersistence';

export default function App() {
  const winPanelHeight = useUiStore((s) => s.winPanelHeight);
  const setWinPanelHeight = useUiStore((s) => s.setWinPanelHeight);

  // Lifecycle hooks (side effects only)
  useInitApp();
  useKeepAlive();
  useAutoInject();
  useHookLog();
  usePersistence();
  const { doPulseNow } = useAntiSleep();

  return (
    <>
      <SvgSprites />
      <TitleBar />

      <main className="content">
        <WindowPanel height={winPanelHeight} onHeightChange={setWinPanelHeight} />

        <section className="lower">
          <TargetPanel />
          <RulePanel />
        </section>
      </main>

      <Footer onPulseNow={doPulseNow} />
    </>
  );
}
