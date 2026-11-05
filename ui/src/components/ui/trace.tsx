import * as React from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "cn"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

type TraceStatus = "running" | "error" | "pending" | undefined

const TraceLineContext = React.createContext<TraceStatus>(undefined)

function Trace({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="trace"
      className={cn("flex min-w-0 flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  )
}

function TraceLine({
  className,
  status,
  ...props
}: React.ComponentProps<"span"> & { status?: TraceStatus }) {
  return (
    <TraceLineContext.Provider value={status}>
      <span
        data-slot="trace-line"
        data-status={status}
        className={cn(
          "flex min-w-0 items-center gap-2 py-1 text-muted-foreground data-[status=error]:text-destructive data-[status=pending]:opacity-60 data-[status=running]:text-foreground",
          className
        )}
        {...props}
      />
    </TraceLineContext.Provider>
  )
}

function TraceIcon({
  className,
  spin = true,
  ...props
}: React.ComponentProps<"span"> & { spin?: boolean }) {
  const status = React.useContext(TraceLineContext)
  return (
    <span
      data-slot="trace-icon"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center [&>svg]:size-3.5",
        status === "running" && spin && "[&>svg]:animate-spin motion-reduce:[&>svg]:animate-none",
        className
      )}
      {...props}
    />
  )
}

function TraceTitle({ className, ...props }: React.ComponentProps<"span">) {
  const status = React.useContext(TraceLineContext)
  return (
    <span
      data-slot="trace-title"
      className={cn("truncate", status === "running" && "shimmer", className)}
      {...props}
    />
  )
}

function TraceDescription({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="trace-description"
      className={cn("ml-1 shrink-0 text-xs text-muted-foreground/70", className)}
      {...props}
    />
  )
}

function TraceCollapsible(props: React.ComponentProps<typeof Collapsible>) {
  return <Collapsible data-slot="trace-collapsible" {...props} />
}

function TraceCollapsibleTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger>) {
  return (
    <CollapsibleTrigger
      data-slot="trace-collapsible-trigger"
      className={cn(
        "group/trace flex w-full min-w-0 cursor-pointer items-center rounded-md text-left outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRight
        className="ml-1 size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]/trace:rotate-90 rtl:-scale-x-100"
        aria-hidden="true"
      />
    </CollapsibleTrigger>
  )
}

function TraceCollapsibleContent({
  className,
  forceMount,
  disableAnimation,
  ...props
}: React.ComponentProps<typeof CollapsibleContent> & {
  /** Keep the content in the page while closed. */
  forceMount?: boolean
  /** Skip the height animation. */
  disableAnimation?: boolean
}) {
  return (
    <CollapsibleContent
      data-slot="trace-collapsible-content"
      keepMounted={forceMount}
      className={cn(
        "ml-[7px] flex flex-col gap-1 border-l py-1 pl-4 text-muted-foreground",
        !disableAnimation &&
          "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none",
        className
      )}
      {...props}
    />
  )
}

export {
  Trace,
  TraceLine,
  TraceIcon,
  TraceTitle,
  TraceDescription,
  TraceCollapsible,
  TraceCollapsibleTrigger,
  TraceCollapsibleContent,
}
