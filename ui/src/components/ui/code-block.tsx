import * as React from "react"
import { cn } from "cn"

function CodeBlock({ className, children, ...props }: React.ComponentProps<"pre">) {
  return (
    <pre
      data-slot="code-block"
      className={cn(
        "overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground",
        className
      )}
      {...props}
    >
      <code>{children}</code>
    </pre>
  )
}

export { CodeBlock }
