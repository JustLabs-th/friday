import { useState } from 'react';

/**
 * Whether the terminal and the side panel are showing. The side panel starts open on the session
 * overview; a preview (opened by the user or the agent) takes its place until it is closed.
 */
export function usePanels() {
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);

  return {
    terminalOpen,
    toggleTerminal: () => setTerminalOpen(open => !open),
    closeTerminal: () => setTerminalOpen(false),
    rightPanelOpen,
    previewOpen,
    toggleRightPanel: () => {
      setRightPanelOpen(open => !open);
      setPreviewOpen(false);
    },
    /** Closing a preview brings the overview back; closing the overview hides the panel. */
    closeRightPanel: () => {
      if (previewOpen) setPreviewOpen(false);
      else setRightPanelOpen(false);
    },
    openPreview: () => {
      setPreviewOpen(true);
      setRightPanelOpen(true);
    },
  };
}
