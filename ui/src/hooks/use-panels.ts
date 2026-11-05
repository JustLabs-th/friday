import { useState } from 'react';
import type { RightPanelTab } from '@/components/panels/right-panel';

/** Whether the terminal and the right panel are showing, and which tab the right panel is on. */
export function usePanels() {
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('overview');

  return {
    terminalOpen,
    toggleTerminal: () => setTerminalOpen(open => !open),
    closeTerminal: () => setTerminalOpen(false),
    rightPanelOpen,
    toggleRightPanel: () => setRightPanelOpen(open => !open),
    closeRightPanel: () => setRightPanelOpen(false),
    rightPanelTab,
    setRightPanelTab,
    openPreview: () => {
      setRightPanelTab('preview');
      setRightPanelOpen(true);
    },
  };
}
