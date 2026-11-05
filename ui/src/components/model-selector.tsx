import { Fragment } from 'react';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { InputGroupButton } from '@/components/ui/input-group';
import { effortLabels, models as defaultModels, type Effort, type ModelInfo } from '@/lib/models';

interface ModelSelectorProps {
  modelId: string;
  effort: Effort;
  onModelChange: (model: ModelInfo) => void;
  onEffortChange: (effort: Effort) => void;
  models?: ModelInfo[];
  disabled?: boolean;
}

export function ModelSelector({ modelId, effort, onModelChange, onEffortChange, models = defaultModels, disabled = false }: ModelSelectorProps) {
  const families = Array.from(new Set(models.map(item => item.family)));
  const current = models.find(item => item.id === modelId) ?? models[0];
  if (!current) return <span className="text-xs text-muted-foreground">Codex default</span>;
  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger render={<InputGroupButton type="button" variant="ghost" size="xs" disabled={disabled} aria-label={`Model: ${current.name}`} />}>
          {current.name}
          <ChevronDown aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuRadioGroup
            value={current.id}
            onValueChange={value => {
              const next = models.find(item => item.id === value);
              if (next) onModelChange(next);
            }}
          >
            {families.map((family, index) => (
              <Fragment key={family}>
                {index > 0 && <DropdownMenuSeparator />}
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{family}</DropdownMenuLabel>
                  {models.filter(item => item.family === family).map(item => (
                    <DropdownMenuRadioItem key={item.id} value={item.id}>{item.name}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuGroup>
              </Fragment>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger render={<InputGroupButton type="button" variant="ghost" size="xs" disabled={disabled || !current.efforts.length} aria-label={`Effort: ${effortLabels[effort]}`} />}>
          {effortLabels[effort]}
          <ChevronDown aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-40">
          <DropdownMenuRadioGroup value={effort} onValueChange={value => onEffortChange(value as Effort)}>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Effort</DropdownMenuLabel>
              {current.efforts.map(level => (
                <DropdownMenuRadioItem key={level} value={level}>{effortLabels[level]}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
