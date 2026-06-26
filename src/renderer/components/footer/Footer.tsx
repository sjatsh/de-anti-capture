import { ActionBar } from './ActionBar';
import { SettingsRows } from './SettingsRows';
import { LogSection } from './LogSection';

interface FooterProps {
  onPulseNow: () => void;
}

export function Footer({ onPulseNow }: FooterProps) {
  return (
    <footer className="footer">
      <ActionBar />
      <SettingsRows onPulseNow={onPulseNow} />
      <LogSection />
    </footer>
  );
}
