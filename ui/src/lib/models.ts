// Snapshot of the user-selectable models in codex-rs/models-manager/models.json
// (entries with visibility "list"). Regenerate when that file changes.
export type Effort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';

export interface ModelInfo {
  id: string;
  name: string;
  family: string;
  defaultEffort: Effort;
  efforts: Effort[];
}

export const effortLabels: Record<Effort, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
  ultra: 'Ultra',
};

export const models: ModelInfo[] = [
  {
    "id": "gpt-6-astra",
    "name": "GPT-6-Astra",
    "family": "GPT-6",
    "defaultEffort": "low",
    "efforts": [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra"
    ]
  },
  {
    "id": "gpt-6.1-sol",
    "name": "GPT-6.1-Sol",
    "family": "GPT-6.1",
    "defaultEffort": "low",
    "efforts": [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra"
    ]
  },
  {
    "id": "gpt-6.1-terra",
    "name": "GPT-6.1 Terra",
    "family": "GPT-6.1",
    "defaultEffort": "low",
    "efforts": [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra"
    ]
  },
  {
    "id": "gpt-6-sol",
    "name": "GPT-6-Sol",
    "family": "GPT-6",
    "defaultEffort": "medium",
    "efforts": [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra"
    ]
  },
  {
    "id": "gpt-6-luna",
    "name": "GPT-6-Luna",
    "family": "GPT-6",
    "defaultEffort": "medium",
    "efforts": [
      "low",
      "medium",
      "high",
      "xhigh",
      "max"
    ]
  },
  {
    "id": "gpt-5.6-sol",
    "name": "GPT-5.6-Sol",
    "family": "GPT-5.6",
    "defaultEffort": "low",
    "efforts": [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra"
    ]
  },
  {
    "id": "gpt-5.6-terra",
    "name": "GPT-5.6-Terra",
    "family": "GPT-5.6",
    "defaultEffort": "medium",
    "efforts": [
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra"
    ]
  },
  {
    "id": "gpt-5.6-luna",
    "name": "GPT-5.6-Luna",
    "family": "GPT-5.6",
    "defaultEffort": "medium",
    "efforts": [
      "low",
      "medium",
      "high",
      "xhigh",
      "max"
    ]
  },
  {
    "id": "gpt-5.5",
    "name": "GPT-5.5",
    "family": "GPT-5.5",
    "defaultEffort": "medium",
    "efforts": [
      "low",
      "medium",
      "high",
      "xhigh"
    ]
  }
];
