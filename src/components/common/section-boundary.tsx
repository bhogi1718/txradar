"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  /** Human name for the section, used in the fallback ("the flow timeline"). */
  name: string;
  children: ReactNode;
  className?: string;
};

type State = { error: Error | null };

/**
 * Contains a render error to one section of the page. Without it, a bug in
 * one panel (say, a chart choking on an unexpected value) would take down
 * the whole wallet view via the route-level error boundary.
 *
 * Error boundaries still require a class component in React 19.
 */
export class SectionBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}]`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className={
          this.props.className ??
          "flex flex-col items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center"
        }
      >
        <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
        <div className="flex-1">
          <p className="font-medium">The {this.props.name} couldn&apos;t be displayed.</p>
          <p className="text-xs text-muted-foreground">
            The rest of the page still works. The error was logged to the console.
          </p>
        </div>
        <button
          type="button"
          onClick={this.reset}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium outline-none hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCw className="size-3.5" /> Try again
        </button>
      </div>
    );
  }
}
