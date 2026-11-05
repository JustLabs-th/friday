import { CircleCheckIcon, CircleDotIcon, CircleIcon, RouteIcon } from 'lucide-react';
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace';

export interface PlanStep {
  id: string;
  title: string;
  status: 'done' | 'running' | 'pending';
}

export interface PlanData {
  title: string;
  steps: PlanStep[];
}

function StepIcon({ status }: { status: PlanStep['status'] }) {
  return (
    <TraceIcon spin={false}>
      {status === 'done' ? (
        <CircleCheckIcon aria-hidden="true" />
      ) : status === 'running' ? (
        <CircleDotIcon aria-hidden="true" />
      ) : (
        <CircleIcon aria-hidden="true" />
      )}
    </TraceIcon>
  );
}

export function Plan({ plan }: { plan: PlanData }) {
  const done = plan.steps.filter(step => step.status === 'done').length;
  const running = plan.steps.some(step => step.status === 'running');
  return (
    <Trace>
      <TraceCollapsible defaultOpen>
        <TraceCollapsibleTrigger>
          <TraceLine status={running ? 'running' : undefined}>
            <TraceIcon spin={false}>
              <RouteIcon aria-hidden="true" />
            </TraceIcon>
            <TraceTitle>Plan: {plan.title}</TraceTitle>
            <TraceDescription>
              {done} of {plan.steps.length} done
            </TraceDescription>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <Trace>
            {plan.steps.map(step => (
              <TraceLine key={step.id} status={step.status === 'done' ? undefined : step.status}>
                <StepIcon status={step.status} />
                <TraceTitle>{step.title}</TraceTitle>
              </TraceLine>
            ))}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
