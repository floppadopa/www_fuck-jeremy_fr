"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import "./_css/page.css";

interface TableInfo {
  table_name: string;
  column_count: number;
}

function TablePanel({ onTableDeleted }: { onTableDeleted: () => void }) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && deleteModal && !deleting) {
        setDeleteModal(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteModal, deleting]);

  const fetchTables = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dbdiagram/tables");
      if (!res.ok) throw new Error("Failed to fetch tables");
      const data = await res.json();
      setTables(data.tables);
    } catch (err) {
      setError("Failed to load tables");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const handleDelete = async (tableName: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/dbdiagram/table/${tableName}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete table");
      }
      setDeleteModal(null);
      await fetchTables();
      onTableDeleted();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete table");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="table-panel" data-component="TablePanel">
      <div className="table-panel-header">
        <h3>
          Tables
          <span className="table-count">{tables.length}</span>
        </h3>
      </div>
      <div className="table-panel-list">
        {loading ? (
          <div className="table-panel-loading">Loading tables...</div>
        ) : error ? (
          <div className="table-panel-error">
            {error}
            <button className="refresh-btn" onClick={fetchTables} style={{ marginTop: 8 }}>
              Retry
            </button>
          </div>
        ) : tables.length === 0 ? (
          <div className="table-panel-loading">No tables found</div>
        ) : (
          tables.map((table) => (
            <div key={table.table_name} className="table-item">
              <div className="table-info">
                <span className="table-name">{table.table_name}</span>
                <span className="table-columns">{table.column_count} columns</span>
              </div>
              <button
                className="delete-btn"
                onClick={() => setDeleteModal(table.table_name)}
                title={`Delete ${table.table_name}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {deleteModal && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setDeleteModal(null)}
              disabled={deleting}
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <h4>Delete Table</h4>
            <p>
              Are you sure you want to delete <code>{deleteModal}</code>?
              <br />
              <br />
              This will permanently remove the table and all its data from the database. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setDeleteModal(null)} disabled={deleting}>
                Cancel
              </button>
              <button className="modal-delete" onClick={() => handleDelete(deleteModal)} disabled={deleting}>
                {deleting ? "Deleting..." : "Delete Table"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DbDiagramPage() {
  const initialized = useRef(false);
  const [diagramKey, setDiagramKey] = useState(0);
  const [showPanel, setShowPanel] = useState(true);

  const handleTableDeleted = useCallback(() => {
    // Reload the diagram by remounting
    setDiagramKey((k) => k + 1);
    // Also reload the page to refresh the diagram
    window.location.reload();
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Set up globals
    (window as any)["_fs_namespace"] = "FS";
    (window as any)["_internal_staff"] = null;

    // Load cookie.js FIRST (contains fetch interceptor)
    const cookieScript = document.createElement("script");
    cookieScript.src = "/database/js/cookie.js";
    cookieScript.async = false;
    document.head.appendChild(cookieScript);

    // Wait for cookie.js to load before loading the main script
    cookieScript.onload = () => {
      // Load CSS
      const cssLink = document.createElement("link");
      cssLink.rel = "stylesheet";
      cssLink.href = "/database/assets/index-B5iclh-t.css";
      cssLink.crossOrigin = "anonymous";
      document.head.appendChild(cssLink);

      // Load additional CSS files
      const additionalCss = [
        "/database/assets/diagram-DJO-dynF.css",
        "/database/assets/DbxNotifications-DgyFJ-QX.css",
        "/database/assets/PrivatePageContainer-__1G81FE.css",
      ];

      additionalCss.forEach((cssUrl) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = cssUrl;
        document.head.appendChild(link);
      });

      // Load Popper.js
      const popperScript = document.createElement("script");
      popperScript.src =
        "https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.14.7/umd/popper.min.js";
      popperScript.integrity =
        "sha384-UO2eT0CpHqdSJQ6hJty5KVphtPhzWj9WO1clHTMGa3JDZwrnQq4sF86dIHNDz0W1";
      popperScript.crossOrigin = "anonymous";
      document.head.appendChild(popperScript);

      // Load Google accounts
      const googleScript = document.createElement("script");
      googleScript.src = "https://accounts.google.com/gsi/client";
      googleScript.async = true;
      googleScript.defer = true;
      document.head.appendChild(googleScript);

      // Load Chargebee
      const chargebeeScript = document.createElement("script");
      chargebeeScript.src = "https://js.chargebee.com/v2/chargebee.js";
      document.head.appendChild(chargebeeScript);

      // Load main dbdiagram script
      const mainScript = document.createElement("script");
      mainScript.type = "module";
      mainScript.src = "/database/assets/index-CDtQ8wxC.js";
      mainScript.crossOrigin = "anonymous";
      document.body.appendChild(mainScript);

      // Add Google Fonts
      const fonts = [
        "https://fonts.googleapis.com/css?family=Open+Sans:300,400,600,700,800",
        "https://fonts.googleapis.com/css?family=Crimson+Text:400,400italic,700,700italic|Roboto:400,700,700italic,400italic",
        "https://fonts.googleapis.com/css?family=Droid+Sans+Mono",
      ];

      fonts.forEach((fontUrl) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = fontUrl;
        document.head.appendChild(link);
      });
    };
  }, []);

  return (
    <div className="diagram-container" data-component="DbDiagramPage">
      <div className="diagram-main">
        <div id="app" key={diagramKey}></div>
      </div>
      <button
        className={`panel-toggle ${showPanel ? "panel-open" : ""}`}
        onClick={() => setShowPanel(!showPanel)}
        title={showPanel ? "Hide table list" : "Show table list"}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
      {showPanel && <TablePanel onTableDeleted={handleTableDeleted} />}
    </div>
  );
}
