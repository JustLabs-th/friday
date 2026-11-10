import { useEffect, useState } from 'react';
import type { Effort, ModelInfo } from '@/lib/models';

/**
 * The model and reasoning effort picked for the next message. Once the models are known it settles on
 * the engine's default, and keeps the effort valid for whichever model is chosen.
 */
export function useModelChoice(models: ModelInfo[], defaultModel: string | null | undefined) {
  const [modelId, setModelId] = useState('');
  const [effort, setEffort] = useState<Effort>('medium');

  useEffect(() => {
    if (!models.length) return;
    const selected = models.find(model => model.id === modelId);
    if (!selected) {
      const fallback = models.find(model => model.id === defaultModel) || models[0];
      setModelId(fallback.id);
      setEffort(fallback.defaultEffort);
    } else if (selected.efforts.length && !selected.efforts.includes(effort)) {
      setEffort(selected.defaultEffort);
    }
  }, [models, defaultModel, modelId, effort]);

  function chooseModel(next: ModelInfo) {
    setModelId(next.id);
    if (!next.efforts.includes(effort)) setEffort(next.defaultEffort);
  }

  return { modelId, effort, setEffort, chooseModel };
}
