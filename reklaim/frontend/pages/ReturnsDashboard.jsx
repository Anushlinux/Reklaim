import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./style/returns-dashboard.css";
import "./style/map-widget.css";
import axios from "axios";
import urlJoin from "url-join";
import MapWidget from "../components/MapWidget";

const EXAMPLE_MAIN_URL = window.location.origin;

const getRiskLevel = (flagCount) => {
  if (flagCount >= 3) return "High";
  if (flagCount >= 1) return "Medium";
  return "Low";
};

const getRiskColor = (flagCount) => {
  if (flagCount >= 3) return "risk-high";
  if (flagCount >= 1) return "risk-medium";
  return "risk-low";
};

const getDecisionBadgeClass = (decision) => {
  switch (decision) {
    case "reject":
      return "decision-reject";
    case "manual_review":
      return "decision-review";
    case "approve":
      return "decision-approve";
    default:
      return "decision-default";
  }
};

const Icon = ({ name, className = "", size = 18 }) => {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    className,
    "aria-hidden": true
  };

  switch (name) {
    case "refresh":
      return (
        <svg {...common}>
          <path
            d="M20 6v6h-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M20 12a8 8 0 1 1-2.34-5.66L20 6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <path
            d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M16.5 16.5 21 21"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "chevronDown":
      return (
        <svg {...common}>
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "chevronUp":
      return (
        <svg {...common}>
          <path
            d="m6 15 6-6 6 6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "sort":
      return (
        <svg {...common}>
          <path
            d="m8 10 4-4 4 4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="m16 14-4 4-4-4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "trend":
      return (
        <svg {...common}>
          <path
            d="M4 16l6-6 4 4 6-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14 8h6v6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "money":
      return (
        <svg {...common}>
          <path d="M12 1v22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path
            d="M17 5.5c0-2.2-2.2-4-5-4s-5 1.8-5 4 2.2 4 5 4 5 1.8 5 4-2.2 4-5 4-5-1.8-5-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path
            d="M12 2 20 6v6c0 5-3.5 9.4-8 10-4.5-.6-8-5-8-10V6l8-4Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="m9 12 2 2 4-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return null;
  }
};

const KPI = ({ label, value, meta, tone = "default", icon }) => {
  return (
    <div className={`kpi-card kpi-${tone}`}>
      <div className="kpi-head">
        <div className="kpi-label">{label}</div>
        <div className="kpi-icon" aria-hidden="true">
          <Icon name={icon} />
        </div>
      </div>
      <div className="kpi-value">{value}</div>
      {meta ? <div className="kpi-meta">{meta}</div> : null}
    </div>
  );
};

export const ReturnsDashboard = () => {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState({
    analyzed_returns: 0,
    total_value: 0,
    avg_return_rate: 0,
    exclusive_cod_users: 0,
    high_risk_count: 0
  });
  const [returns, setReturns] = useState([]);
  const [filteredReturns, setFilteredReturns] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [expandedRow, setExpandedRow] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [showMapWidget, setShowMapWidget] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  const { application_id, company_id } = useParams();
  const navigate = useNavigate();

  const rupee = useMemo(
    () => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }),
    []
  );

  const fetchReturnsData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(urlJoin(EXAMPLE_MAIN_URL, "/api/returns"), {
        timeout: 50000
      });
      if (data.success) {
        setSummary(data.summary);
        setReturns(data.returns);
        setFilteredReturns(data.returns);
        setLastUpdatedAt(new Date());
        if (data.metadata) {
          setMetadata(data.metadata);
        }
      }
    } catch (e) {
      console.error("Returns dashboard fetch error:", e.message || e);
      if (e.code === "ECONNABORTED" || e.message?.includes("timeout")) {
        console.warn("Request timed out. The API is taking longer than expected.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerWorkflow = useCallback(async () => {
    setLoading(true);
    try {
      // Call the Boltic workflow API to start the workflow (fire and forget)
      axios.get("https://asia-south1.workflow.boltic.app/28172f97-4539-4efb-8b90-c59095908073", {
        timeout: 50000
      }).then(() => {
        console.log("✅ Workflow triggered successfully");
      }).catch((err) => {
        console.error("❌ Workflow trigger error:", err.message);
      });

      // Independently fetch the data from the read API
      await fetchReturnsData();
    } catch (e) {
      console.error("Error:", e.message || e);
    } finally {
      setLoading(false);
    }
  }, [fetchReturnsData]);

  const applyFilters = useCallback(() => {
    let filtered = [...returns];

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter((item) => {
        const name = item.user_name?.toLowerCase?.() || "";
        const mobile = item.user_mobile?.toLowerCase?.() || "";
        const shipment = item.shipment_id?.toLowerCase?.() || "";
        const city = item.delivery_city?.toLowerCase?.() || "";
        return (
          name.includes(q) || mobile.includes(q) || shipment.includes(q) || city.includes(q)
        );
      });
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((item) => item.decision === statusFilter);
    }

    if (riskFilter !== "all") {
      filtered = filtered.filter((item) => getRiskLevel(item.flag_count).toLowerCase() === riskFilter);
    }

    setFilteredReturns(filtered);
  }, [returns, riskFilter, searchTerm, statusFilter]);

  useEffect(() => {
    fetchReturnsData();
  }, [fetchReturnsData]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });

    const sorted = [...filteredReturns].sort((a, b) => {
      if (a[key] < b[key]) return direction === "asc" ? -1 : 1;
      if (a[key] > b[key]) return direction === "asc" ? 1 : -1;
      return 0;
    });
    setFilteredReturns(sorted);
  };

  const isSortedBy = (key) => sortConfig.key === key;

  const toggleRowExpansion = (id) => {
    setExpandedRow(expandedRow === id ? null : id);
  };



  const generateReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const response = await axios.get(urlJoin(EXAMPLE_MAIN_URL, "/api/generate-report"), {
        responseType: 'blob',
        timeout: 60000
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `returns-report-${new Date().toISOString().split('T')[0]}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Report generation error:", e.message || e);
      alert("Failed to generate report. Please try again.");
    } finally {
      setReportLoading(false);
    }
  }, []);

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-left">
          <div className="breadcrumbs">Analytics / Returns</div>
          <h1>Returns Intelligence</h1>
          <p>Fraud signals, risk flags and recommended actions — all in one place.</p>
          {lastUpdatedAt ? (
            <div className="updated-at">
              Updated{" "}
              {lastUpdatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {metadata && metadata.record_id && (
                <> • Record: {metadata.record_id.substring(0, 8)}... • Total records: {metadata.total_records || 'N/A'}</>
              )}
            </div>
          ) : null}
        </div>

        <div className="header-right">
          <button
            className="btn btn-primary"
            onClick={() => setShowMapWidget(true)}
            type="button"
            style={{ marginRight: '12px' }}
          >
            🗺️ Risk Map
          </button>

        </div>
      </header>

      <section className="dashboard-section">
        <div className="kpi-cards">
          <KPI
            label="Total returns"
            value={rupee.format(summary.analyzed_returns || 0)}
            meta={`COD-only customers: ${rupee.format(summary.exclusive_cod_users || 0)}`}
            tone="primary"
            icon="trend"
          />
          <KPI
            label="Total value"
            value={`₹${rupee.format(summary.total_value || 0)}`}
            meta="Refund exposure"
            tone="success"
            icon="money"
          />
          <KPI
            label="Rejection rate"
            value={`${Number(summary.avg_return_rate || 0).toFixed(1)}%`}
            meta="Share of high-risk outcomes"
            tone="warning"
            icon="sort"
          />
          <KPI
            label="High risk cases"
            value={rupee.format(summary.high_risk_count || 0)}
            meta="Flag count ≥ 3"
            tone="danger"
            icon="shield"
          />
        </div>
      </section>

      <section className="dashboard-section">
        <div className="filters-bar">
          <div className="filters-left">
            <div className="field search-field">
              <span className="field-icon" aria-hidden="true">
                <Icon name="search" size={18} />
              </span>
              <input
                type="text"
                placeholder="Search customer, mobile, shipment or city"
                className="search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="statusFilter">
                Status
              </label>
              <select
                id="statusFilter"
                className="filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="reject">Reject</option>
                <option value="manual_review">Manual review</option>
                <option value="approve">Approve</option>
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="riskFilter">
                Risk
              </label>
              <select
                id="riskFilter"
                className="filter-select"
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="filters-right">
            <button
              className="btn btn-primary"
              onClick={triggerWorkflow}
              disabled={loading}
              type="button"
            >
              <span className={loading ? "spin" : ""} aria-hidden="true">
                <Icon name="refresh" />
              </span>
              {loading ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="table-container">
          <div className="table-header">
            <div>
              <h2>Returns</h2>
              <p className="table-subtitle">
                Showing {filteredReturns.length} of {returns.length}
                {summary.avg_fraud_score ? ` • Avg fraud score: ${summary.avg_fraud_score}/10` : ""}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="loading-state">
              <div className="spinner" />
              <p>Loading returns data…</p>
            </div>
          ) : filteredReturns.length === 0 ? (
            <div className="empty-state">
              <h3>No results</h3>
              <p>Try adjusting the filters or search query.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="returns-table">
                <thead>
                  <tr>
                    <th>
                      <button
                        type="button"
                        className={`th-button ${isSortedBy("user_name") ? "active" : ""}`}
                        onClick={() => handleSort("user_name")}
                      >
                        Customer
                        <span className="sort-indicator" aria-hidden="true">
                          <Icon name="sort" size={16} />
                        </span>
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={`th-button ${isSortedBy("item_name") ? "active" : ""}`}
                        onClick={() => handleSort("item_name")}
                      >
                        Item
                        <span className="sort-indicator" aria-hidden="true">
                          <Icon name="sort" size={16} />
                        </span>
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={`th-button ${isSortedBy("refund_amount") ? "active" : ""}`}
                        onClick={() => handleSort("refund_amount")}
                      >
                        Amount
                        <span className="sort-indicator" aria-hidden="true">
                          <Icon name="sort" size={16} />
                        </span>
                      </button>
                    </th>
                    <th>Payment</th>
                    <th>Location</th>
                    <th>Reason</th>
                    <th>
                      <button
                        type="button"
                        className={`th-button ${isSortedBy("flag_count") ? "active" : ""}`}
                        onClick={() => handleSort("flag_count")}
                      >
                        Risk
                        <span className="sort-indicator" aria-hidden="true">
                          <Icon name="sort" size={16} />
                        </span>
                      </button>
                    </th>
                    <th>Decision</th>
                    <th className="th-actions"> </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredReturns.map((item) => (
                    <React.Fragment key={item.id}>
                      <tr className={item.flag_count >= 3 ? "row-high-risk" : ""}>
                        <td>
                          <div className="user-info">
                            <div className="user-name">{item.user_name || "—"}</div>
                            <div className="user-mobile">{item.user_mobile || ""}</div>
                          </div>
                        </td>
                        <td>
                          <div className="item-info">
                            <div className="item-name">{item.item_name || "—"}</div>
                            <div className="shipment-id">Shipment #{item.shipment_id || "—"}</div>
                          </div>
                        </td>
                        <td className="amount">₹{rupee.format(item.refund_amount || 0)}</td>
                        <td>
                          <span className={`pill ${item.is_cod ? "pill-cod" : "pill-prepaid"}`}>
                            {item.is_cod ? "COD" : "Prepaid"}
                          </span>
                        </td>
                        <td>
                          <div className="location-info">
                            <div className="location-city">{item.delivery_city || "—"}</div>
                            <div className="pincode">{item.delivery_pincode || ""}</div>
                          </div>
                        </td>
                        <td className="reason-text" title={item.reason_text || ""}>
                          {item.reason_text || "—"}
                        </td>
                        <td>
                          <span className={`pill ${getRiskColor(item.flag_count)}`}>
                            {getRiskLevel(item.flag_count)} • {item.flag_count}
                          </span>
                        </td>
                        <td>
                          <span className={`pill ${getDecisionBadgeClass(item.decision)}`}>
                            {item.decision === "manual_review" ? "Review" : item.decision || "—"}
                          </span>
                        </td>
                        <td className="actions-cell">
                          <button
                            className="icon-button"
                            onClick={() => toggleRowExpansion(item.id)}
                            aria-expanded={expandedRow === item.id}
                            aria-label={expandedRow === item.id ? "Collapse details" : "Expand details"}
                            type="button"
                          >
                            {expandedRow === item.id ? (
                              <Icon name="chevronUp" size={18} />
                            ) : (
                              <Icon name="chevronDown" size={18} />
                            )}
                          </button>
                        </td>
                      </tr>

                      {expandedRow === item.id && (
                        <tr className="expanded-row">
                          <td colSpan="9">
                            <div className="expanded-content">
                              <div className="expanded-grid">
                                <div className="expanded-section">
                                  <h4>Fraud analysis</h4>
                                  <div className="analysis-grid">
                                    <div className="analysis-item">
                                      <span className="label">Fraud score</span>
                                      <span
                                        className={`value score-badge ${item.fraud_score >= 7
                                          ? "score-high"
                                          : item.fraud_score >= 5
                                            ? "score-medium"
                                            : "score-low"
                                          }`}
                                      >
                                        {item.fraud_score}/10
                                      </span>
                                    </div>
                                    <div className="analysis-item">
                                      <span className="label">Confidence</span>
                                      <span className="value">
                                        {Math.round((item.confidence || 0) * 100)}%
                                      </span>
                                    </div>
                                    <div className="analysis-item">
                                      <span className="label">Segment</span>
                                      <span
                                        className={`value segment-badge segment-${item.segment?.toLowerCase?.() || "gray"
                                          }`}
                                      >
                                        {item.segment || "—"}
                                      </span>
                                    </div>
                                    <div className="analysis-item">
                                      <span className="label">Prime score</span>
                                      <span className="value">{item.prime_score}/10</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="expanded-section">
                                  <h4>Recommended action</h4>
                                  <div className="action-recommendation">
                                    <span className={`incentive-badge incentive-${item.incentive}`}>
                                      {item.incentive}
                                    </span>
                                    <p>{item.recommended_action}</p>
                                  </div>
                                </div>

                                <div className="expanded-section expanded-span-2">
                                  <h4>Pattern flags</h4>
                                  <div className="flags-list">
                                    {Array.isArray(item.pattern_flags) && item.pattern_flags.length > 0 ? (
                                      item.pattern_flags.map((flag, idx) => (
                                        <span key={idx} className="flag-badge">
                                          {String(flag).replace(/_/g, " ")}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="muted">No flags detected</span>
                                    )}
                                  </div>
                                </div>

                                {item.reasoning && (
                                  <div className="expanded-section expanded-span-2">
                                    <h4>Reasoning</h4>
                                    <div className="reasoning-grid">
                                      <div className="reasoning-item">
                                        <strong>Text</strong>
                                        <p>{item.reasoning.text}</p>
                                      </div>
                                      <div className="reasoning-item">
                                        <strong>Behavior</strong>
                                        <p>{item.reasoning.behavioral}</p>
                                      </div>
                                      <div className="reasoning-item">
                                        <strong>History</strong>
                                        <p>{item.reasoning.history}</p>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {item.weighted_breakdown && (
                                  <div className="expanded-section expanded-span-2">
                                    <h4>Score breakdown</h4>
                                    <div className="score-breakdown">
                                      <div className="breakdown-item">
                                        <span>Text</span>
                                        <span className="breakdown-bar">
                                          <span
                                            style={{
                                              width: `${(item.weighted_breakdown.text_score / 3) * 100}%`
                                            }}
                                          />
                                        </span>
                                        <span>{item.weighted_breakdown.text_score}/3</span>
                                      </div>
                                      <div className="breakdown-item">
                                        <span>Behavioral</span>
                                        <span className="breakdown-bar">
                                          <span
                                            style={{
                                              width: `${(item.weighted_breakdown.behavioral_score / 3.5) * 100
                                                }%`
                                            }}
                                          />
                                        </span>
                                        <span>{item.weighted_breakdown.behavioral_score}/3.5</span>
                                      </div>
                                      <div className="breakdown-item">
                                        <span>History</span>
                                        <span className="breakdown-bar">
                                          <span
                                            style={{
                                              width: `${(item.weighted_breakdown.history_score / 3.5) * 100
                                                }%`
                                            }}
                                          />
                                        </span>
                                        <span>{item.weighted_breakdown.history_score}/3.5</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Get Reports Section */}
      <section className="dashboard-section" style={{ paddingBottom: '40px' }}>
        <div className="report-section" style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '24px',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
          borderRadius: '12px',
          border: '1px solid rgba(99, 102, 241, 0.2)'
        }}>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{
              margin: '0 0 8px 0',
              color: '#1f2937',
              fontSize: '18px',
              fontWeight: '600'
            }}>
              📊 Export Returns Report
            </h3>
            <p style={{
              margin: '0 0 16px 0',
              color: '#6b7280',
              fontSize: '14px'
            }}>
              Download a comprehensive PDF report with all returns data, risk analysis, and recommendations.
            </p>
            <button
              className="btn btn-primary"
              onClick={generateReport}
              disabled={reportLoading}
              type="button"
              style={{
                padding: '12px 32px',
                fontSize: '16px',
                fontWeight: '600',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)'
              }}
            >
              {reportLoading ? (
                <>
                  <span className="spin" aria-hidden="true">
                    <Icon name="refresh" />
                  </span>
                  Generating...
                </>
              ) : (
                <>
                  📄 Get Reports
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Map Widget Modal */}
      <MapWidget
        isOpen={showMapWidget}
        onClose={() => setShowMapWidget(false)}
      />
    </div>
  );
};

export default ReturnsDashboard;
