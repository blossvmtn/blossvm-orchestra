import type { FileAtlasState } from "../../hooks/useFileAtlasSnapshot";
import { buildFileAtlasViewModel } from "./fileAtlasViewModel";

function statusLabel(status: "healthy" | "attention" | "unknown"): string {
  if (status === "healthy") return "Healthy";
  if (status === "attention") return "Attention";
  return "Unknown";
}

function Status({ value }: { value: "healthy" | "attention" | "unknown" }) {
  return <span className={`atlas-status atlas-status-${value}`}>{statusLabel(value)}</span>;
}

export function FilesView({ snapshot, error, loading, refresh }: FileAtlasState) {
  if (loading && !snapshot) {
    return <div className="atlas-empty">Reading the workstation projection…</div>;
  }
  if (!snapshot) {
    return (
      <div className="atlas-empty">
        <p>Workstation evidence is unavailable.</p>
        <button className="atlas-refresh" type="button" onClick={() => void refresh()}>
          Retry
        </button>
      </div>
    );
  }

  const model = buildFileAtlasViewModel(snapshot);

  return (
    <section className="atlas" aria-label="File Atlas">
      <header className="atlas-intro">
        <div>
          <p className="atlas-kicker">Read-only workstation projection</p>
          <h1>Files</h1>
          <p>See what needs attention without browsing private contents.</p>
        </div>
        <div className="atlas-freshness">
          <Status value={snapshot.status} />
          <span>{error ? "Last successful observation" : "Observed just now"}</span>
          <button type="button" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </header>

      <div className="atlas-grid">
        <article className="panel atlas-card atlas-card-wide">
          <div className="atlas-card-head">
            <div>
              <span className="atlas-eyebrow">Now</span>
              <h2>Repository attention</h2>
            </div>
            <Status value={snapshot.repositories.status} />
          </div>
          <p className="atlas-value">{model.repositorySummary}</p>
          <p className="atlas-note">
            Existing tracking refs only · no fetch performed
          </p>
        </article>

        <article className="panel atlas-card">
          <div className="atlas-card-head">
            <div>
              <span className="atlas-eyebrow">Files</span>
              <h2>This Mac</h2>
            </div>
            <Status value={snapshot.surfaces.thisMac.status} />
          </div>
          <p className="atlas-value">{model.localInbox}</p>
          <p className="atlas-note">{snapshot.surfaces.thisMac.categories.join(" · ")}</p>
        </article>

        <article className="panel atlas-card">
          <div className="atlas-card-head">
            <div>
              <span className="atlas-eyebrow">Mobile continuation</span>
              <h2>Anywhere</h2>
            </div>
            <Status value={snapshot.surfaces.anywhere.status} />
          </div>
          <p className="atlas-value">{model.mobileInbox}</p>
          <p className="atlas-note">{snapshot.surfaces.anywhere.categories.join(" · ")}</p>
        </article>

        <article className="panel atlas-card">
          <div className="atlas-card-head">
            <div>
              <span className="atlas-eyebrow">Custody</span>
              <h2>Recovery</h2>
            </div>
            <Status value={snapshot.recovery.status} />
          </div>
          <dl className="atlas-recovery">
            <div>
              <dt>Local vault receipt</dt>
              <dd>{model.localRecovery}</dd>
            </div>
            <div>
              <dt>Encrypted custody receipt</dt>
              <dd>{model.encryptedRecovery}</dd>
            </div>
          </dl>
        </article>

        <article className="panel atlas-card">
          <div className="atlas-card-head">
            <div>
              <span className="atlas-eyebrow">Company</span>
              <h2>Shared documents</h2>
            </div>
            <Status value={snapshot.companyDocuments.status} />
          </div>
          <p className="atlas-value atlas-value-small">
            {snapshot.companyDocuments.availability === "available"
              ? "Destination available"
              : snapshot.companyDocuments.availability === "unavailable"
                ? "Destination unavailable"
                : "Availability unknown"}
          </p>
        </article>

        <article className="panel atlas-card">
          <div className="atlas-card-head">
            <div>
              <span className="atlas-eyebrow">This Mac</span>
              <h2>Workstation</h2>
            </div>
            <Status value={snapshot.workstation.status} />
          </div>
          <p className="atlas-value atlas-value-small">
            {snapshot.workstation.bootstrap === "configuration_present"
              ? "Bootstrap configuration present"
              : snapshot.workstation.bootstrap === "configuration_missing"
                ? "Bootstrap configuration missing"
                : "Bootstrap configuration unknown"}
          </p>
        </article>

        <article className="panel atlas-card">
          <div className="atlas-card-head">
            <div>
              <span className="atlas-eyebrow">Capacity</span>
              <h2>Storage</h2>
            </div>
            <Status value={snapshot.storage.status} />
          </div>
          <p className="atlas-value atlas-value-small">{model.storage}</p>
        </article>
      </div>

      <footer className="atlas-footer">
        <span>{model.issueSummary}</span>
        <span>No filenames or source contents shown</span>
      </footer>
    </section>
  );
}
