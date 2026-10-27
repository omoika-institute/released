import { Component } from "preact";
import { Suspense } from "preact/compat";
import i18n from "@/i18n";
import { AppLoading } from "./loaders";

class ChunkErrorBoundary extends Component<{ children: any }, { err?: any }> {
  state = { err: undefined };
  static getDerivedStateFromError(err: any) {
    return { err };
  }
  render() {
    if (this.state.err) {
      return (
        <div class="chunk-error">
          <h2>{i18n.t("shared.errorBoundary.failedToLoad")}</h2>
          <pre>{String(this.state.err)}</pre>
          <button onClick={() => location.reload()}>{i18n.t("common.reload")}</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ErrorBoundary({ children }: { children: any }) {
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={<AppLoading />}>{children}</Suspense>
    </ChunkErrorBoundary>
  );
}
