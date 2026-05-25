import { Component, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: any) {
    // eslint-disable-next-line no-console
    console.error("[RouteErrorBoundary]", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-xl border border-line bg-white p-6 shadow-sm">
            <div className="font-serif text-xl mb-1">Something went wrong on this page.</div>
            <div className="text-xs text-muted-foreground mb-4">
              The rest of the app is still working. Try reloading this page, or go back and re-enter it.
            </div>
            <pre className="text-[11px] text-[#7A1F1F] bg-[#FEF2F2] border border-[#FECACA] rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { this.setState({ error: null }); }} className="ipc-btn ipc-btn-ghost !h-9 !text-xs">Try again</button>
              <button onClick={() => window.location.reload()} className="ipc-btn ipc-btn-black !h-9 !text-xs">Reload</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
