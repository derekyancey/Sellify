import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; fullPage?: boolean };
type State = { error: Error | null; stack: string };

/** Shows the error instead of a blank white screen when something on a page crashes while rendering. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page crashed:", error, info.componentStack);
    this.setState({ stack: info.componentStack ?? "" });
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    const details = `${error.name}: ${error.message}\n\nPage: ${location.href}\n\n${error.stack ?? ""}${stack ? `\n\nComponents:${stack}` : ""}`;
    return (
      <div className={this.props.fullPage ? "min-h-screen bg-zinc-50 p-6" : ""}>
        <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-white p-6 text-sm">
          <div className="text-base font-semibold text-red-700">Something went wrong on this page</div>
          <p className="mt-1 text-zinc-600">The page hit an error and couldn't finish loading. Reloading may fix it. If it keeps happening, copy the details below and send them over.</p>
          <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-zinc-100 p-3 text-xs whitespace-pre-wrap break-words text-red-800">{error.name}: {error.message}</pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-lg bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-700" onClick={() => location.reload()}>Reload page</button>
            <button className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-50" onClick={() => navigator.clipboard?.writeText(details).catch(() => {})}>Copy error details</button>
            <button className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-50" onClick={() => this.setState({ error: null, stack: "" })}>Try again</button>
          </div>
          <details className="mt-4 text-xs text-zinc-500">
            <summary className="cursor-pointer">Technical details</summary>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words">{details}</pre>
          </details>
        </div>
      </div>
    );
  }
}
