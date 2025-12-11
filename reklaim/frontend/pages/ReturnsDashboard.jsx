import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from 'react-router-dom';
import "./style/returns-dashboard.css";
import axios from "axios";
import urlJoin from "url-join";

const EXAMPLE_MAIN_URL = window.location.origin;

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
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const { application_id, company_id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    fetchReturnsData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [searchTerm, statusFilter, riskFilter, returns]);

  const fetchReturnsData = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(urlJoin(EXAMPLE_MAIN_URL, '/api/returns'));
      if (data.success) {
        setSummary(data.summary);
        setReturns(data.returns);
        setFilteredReturns(data.returns);
      }
    } catch (e) {
      console.error("Error fetching returns data:", e);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...returns];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.user_mobile.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.shipment_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.delivery_city.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(item => item.decision === statusFilter);
    }

    // Risk filter
    if (riskFilter !== "all") {
      filtered = filtered.filter(item => {
        const risk = getRiskLevel(item.flag_count);
        return risk.toLowerCase() === riskFilter;
      });
    }

    setFilteredReturns(filtered);
  };

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
      case 'reject':
        return 'decision-reject';
      case 'manual_review':
        return 'decision-review';
      case 'approve':
        return 'decision-approve';
      default:
        return 'decision-default';
    }
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });

    const sorted = [...filteredReturns].sort((a, b) => {
      if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
      if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    setFilteredReturns(sorted);
  };

  const toggleRowExpansion = (id) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const navigateToHome = () => {
    const basePath = application_id
      ? `/company/${company_id}/application/${application_id}`
      : `/company/${company_id}`;
    navigate(basePath);
  };

  const navigateToSettings = () => {
    const basePath = application_id
      ? `/company/${company_id}/application/${application_id}/settings`
      : `/company/${company_id}/settings`;
    navigate(basePath);
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Returns Intelligence Dashboard</h1>
          <p>Real-time fraud detection and risk analysis</p>
        </div>
        <div className="header-right">
          <button className="nav-button" onClick={navigateToHome}>
            🏠 Home
          </button>
          <button className="nav-button" onClick={navigateToSettings}>
            ⚙️ Settings
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="kpi-cards">
        <div className="kpi-card kpi-primary">
          <div className="kpi-icon">📊</div>
          <div className="kpi-content">
            <div className="kpi-value">{summary.analyzed_returns}</div>
            <div className="kpi-label">Total Returns</div>
          </div>
        </div>

        <div className="kpi-card kpi-success">
          <div className="kpi-icon">₹</div>
          <div className="kpi-content">
            <div className="kpi-value">₹{summary.total_value.toLocaleString()}</div>
            <div className="kpi-label">Total Value</div>
          </div>
        </div>

        <div className="kpi-card kpi-warning">
          <div className="kpi-icon">📈</div>
          <div className="kpi-content">
            <div className="kpi-value">{summary.avg_return_rate}%</div>
            <div className="kpi-label">Rejection Rate</div>
          </div>
        </div>

        <div className="kpi-card kpi-danger">
          <div className="kpi-icon">⚠️</div>
          <div className="kpi-content">
            <div className="kpi-value">{summary.high_risk_count}</div>
            <div className="kpi-label">High Risk Cases</div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="filters-bar">
        <div className="filter-group">
          <input
            type="text"
            placeholder="🔍 Search by user, mobile, or shipment ID..."
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="reject">Reject</option>
            <option value="manual_review">Manual Review</option>
            <option value="approve">Approve</option>
          </select>
        </div>

        <div className="filter-group">
          <select
            className="filter-select"
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
          >
            <option value="all">All Risk Levels</option>
            <option value="high">High Risk</option>
            <option value="medium">Medium Risk</option>
            <option value="low">Low Risk</option>
          </select>
        </div>

        <button className="refresh-button" onClick={fetchReturnsData} disabled={loading}>
          {loading ? '⏳' : '🔄'} Refresh
        </button>
      </div>

      {/* Returns Table */}
      <div className="table-container">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading returns data...</p>
          </div>
        ) : filteredReturns.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3>No Returns Found</h3>
            <p>There are no returns matching your filters.</p>
          </div>
        ) : (
          <table className="returns-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('user_name')}>
                  User Name/Mobile {sortConfig.key === 'user_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('item_name')}>
                  Item {sortConfig.key === 'item_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('refund_amount')}>
                  Amount {sortConfig.key === 'refund_amount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th>Payment</th>
                <th>Location</th>
                <th>Reason</th>
                <th onClick={() => handleSort('flag_count')}>
                  Risk Flags {sortConfig.key === 'flag_count' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th>Decision</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReturns.map((item) => (
                <React.Fragment key={item.id}>
                  <tr className={item.flag_count >= 3 ? 'row-high-risk' : ''}>
                    <td>
                      <div className="user-info">
                        <div className="user-name">{item.user_name}</div>
                        <div className="user-mobile">{item.user_mobile}</div>
                      </div>
                    </td>
                    <td>
                      <div className="item-info">
                        <div className="item-name">{item.item_name}</div>
                        <div className="shipment-id">#{item.shipment_id}</div>
                      </div>
                    </td>
                    <td className="amount">₹{item.refund_amount.toLocaleString()}</td>
                    <td>
                      {item.is_cod ? (
                        <span className="badge badge-cod">COD</span>
                      ) : (
                        <span className="badge badge-prepaid">Prepaid</span>
                      )}
                    </td>
                    <td>
                      <div className="location-info">
                        <div>{item.delivery_city}</div>
                        <div className="pincode">{item.delivery_pincode}</div>
                      </div>
                    </td>
                    <td className="reason-text">{item.reason_text}</td>
                    <td>
                      <div className="risk-flags">
                        <span className={`risk-badge ${getRiskColor(item.flag_count)}`}>
                          {getRiskLevel(item.flag_count)} ({item.flag_count})
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`decision-badge ${getDecisionBadgeClass(item.decision)}`}>
                        {item.decision === 'manual_review' ? 'Review' : item.decision}
                      </span>
                    </td>
                    <td>
                      <button
                        className="action-button"
                        onClick={() => toggleRowExpansion(item.id)}
                      >
                        {expandedRow === item.id ? '▲' : '▼'} Details
                      </button>
                    </td>
                  </tr>

                  {expandedRow === item.id && (
                    <tr className="expanded-row">
                      <td colSpan="9">
                        <div className="expanded-content">
                          <div className="expanded-section">
                            <h4>Fraud Analysis</h4>
                            <div className="analysis-grid">
                              <div className="analysis-item">
                                <span className="label">Fraud Score:</span>
                                <span className="value score-badge" style={{
                                  background: item.fraud_score >= 7 ? '#ef4444' : item.fraud_score >= 5 ? '#f59e0b' : '#10b981',
                                  color: 'white'
                                }}>
                                  {item.fraud_score}/10
                                </span>
                              </div>
                              <div className="analysis-item">
                                <span className="label">Confidence:</span>
                                <span className="value">{Math.round(item.confidence * 100)}%</span>
                              </div>
                              <div className="analysis-item">
                                <span className="label">Segment:</span>
                                <span className={`value segment-badge segment-${item.segment.toLowerCase()}`}>
                                  {item.segment}
                                </span>
                              </div>
                              <div className="analysis-item">
                                <span className="label">Prime Score:</span>
                                <span className="value">{item.prime_score}/10</span>
                              </div>
                            </div>
                          </div>

                          <div className="expanded-section">
                            <h4>Pattern Flags</h4>
                            <div className="flags-list">
                              {item.pattern_flags.map((flag, idx) => (
                                <span key={idx} className="flag-badge">
                                  {flag.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          </div>

                          {item.reasoning && (
                            <div className="expanded-section">
                              <h4>Reasoning</h4>
                              <div className="reasoning-grid">
                                <div className="reasoning-item">
                                  <strong>Text Analysis:</strong>
                                  <p>{item.reasoning.text}</p>
                                </div>
                                <div className="reasoning-item">
                                  <strong>Behavioral:</strong>
                                  <p>{item.reasoning.behavioral}</p>
                                </div>
                                <div className="reasoning-item">
                                  <strong>History:</strong>
                                  <p>{item.reasoning.history}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {item.weighted_breakdown && (
                            <div className="expanded-section">
                              <h4>Score Breakdown</h4>
                              <div className="score-breakdown">
                                <div className="breakdown-item">
                                  <span>Text Score:</span>
                                  <span className="breakdown-bar">
                                    <span style={{ width: `${(item.weighted_breakdown.text_score / 3) * 100}%` }}></span>
                                  </span>
                                  <span>{item.weighted_breakdown.text_score}/3</span>
                                </div>
                                <div className="breakdown-item">
                                  <span>Behavioral Score:</span>
                                  <span className="breakdown-bar">
                                    <span style={{ width: `${(item.weighted_breakdown.behavioral_score / 3.5) * 100}%` }}></span>
                                  </span>
                                  <span>{item.weighted_breakdown.behavioral_score}/3.5</span>
                                </div>
                                <div className="breakdown-item">
                                  <span>History Score:</span>
                                  <span className="breakdown-bar">
                                    <span style={{ width: `${(item.weighted_breakdown.history_score / 3.5) * 100}%` }}></span>
                                  </span>
                                  <span>{item.weighted_breakdown.history_score}/3.5</span>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="expanded-section">
                            <h4>Recommended Action</h4>
                            <div className="action-recommendation">
                              <span className={`incentive-badge incentive-${item.incentive}`}>
                                {item.incentive}
                              </span>
                              <p>{item.recommended_action}</p>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Stats */}
      <div className="footer-stats">
        <p>
          Showing {filteredReturns.length} of {returns.length} returns
          {summary.avg_fraud_score && ` • Average Fraud Score: ${summary.avg_fraud_score}/10`}
        </p>
      </div>
    </div>
  );
};

export default ReturnsDashboard;
