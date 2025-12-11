import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import urlJoin from 'url-join';

const EXAMPLE_MAIN_URL = window.location.origin;

// Fix for default markers in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom marker icons based on risk level
const createRiskIcon = (riskLevel) => {
  const colors = {
    high: '#dc2626', // red-600
    medium: '#f59e0b', // amber-500
    low: '#10b981' // emerald-500
  };
  
  const color = colors[riskLevel] || colors.low;
  
  return L.divIcon({
    className: 'custom-risk-marker',
    html: `<div style="
      background-color: ${color};
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
};

const MapWidget = ({ isOpen, onClose }) => {
  const [riskData, setRiskData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ totalStates: 0, totalHighRiskLocations: 0 });

  useEffect(() => {
    if (isOpen) {
      fetchRiskMapData();
    }
  }, [isOpen]);

  const fetchRiskMapData = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(urlJoin(EXAMPLE_MAIN_URL, '/api/risk-map-data'), {
        timeout: 30000
      });
      
      if (data.success) {
        setRiskData(data.data || []);
        setStats({
          totalStates: data.totalStates || 0,
          totalHighRiskLocations: data.totalHighRiskLocations || 0
        });
      }
    } catch (error) {
      console.error('Error fetching risk map data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="map-widget-overlay">
      <div className="map-widget-container">
        <div className="map-widget-header">
          <div className="map-widget-title">
            <h2>🗺️ Risk Distribution Map</h2>
            <p>High-risk areas with red dots across India</p>
          </div>
          <div className="map-widget-stats">
            <div className="stat-item">
              <span className="stat-value">{stats.totalStates}</span>
              <span className="stat-label">States</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats.totalHighRiskLocations}</span>
              <span className="stat-label">High Risk Areas</span>
            </div>
          </div>
          <button 
            className="map-widget-close"
            onClick={onClose}
            aria-label="Close map"
          >
            ✕
          </button>
        </div>

        <div className="map-widget-content">
          {loading ? (
            <div className="map-loading">
              <div className="spinner" />
              <p>Loading risk data...</p>
            </div>
          ) : (
            <div className="map-container">
              <MapContainer
                center={[20.5937, 78.9629]} // Center of India
                zoom={5}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                
                {riskData.map((stateData) =>
                  stateData.pincodes.map((pincodeData) => (
                    <Marker
                      key={`${stateData.state}-${pincodeData.pincode}`}
                      position={[pincodeData.coordinates.lat, pincodeData.coordinates.lng]}
                      icon={createRiskIcon(pincodeData.riskLevel)}
                    >
                      <Popup>
                        <div className="risk-popup">
                          <h4>{pincodeData.pincode}</h4>
                          <p className="state-name">{stateData.state}</p>
                          <div className="risk-details">
                            <div className="risk-item">
                              <span className="label">Returns:</span>
                              <span className="value">{pincodeData.returns}</span>
                            </div>
                            <div className="risk-item">
                              <span className="label">High Risk:</span>
                              <span className="value">{pincodeData.highRiskCount}</span>
                            </div>
                            <div className="risk-item">
                              <span className="label">Avg Fraud Score:</span>
                              <span className="value">{pincodeData.avgFraudScore}/10</span>
                            </div>
                            <div className="risk-item">
                              <span className="label">Risk Level:</span>
                              <span className={`value risk-${pincodeData.riskLevel}`}>
                                {pincodeData.riskLevel.toUpperCase()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ))
                )}
              </MapContainer>
            </div>
          )}
        </div>

        <div className="map-widget-legend">
          <h4>Risk Legend</h4>
          <div className="legend-items">
            <div className="legend-item">
              <div className="legend-marker high"></div>
              <span>High Risk (3+ flags)</span>
            </div>
            <div className="legend-item">
              <div className="legend-marker medium"></div>
              <span>Medium Risk (1-2 flags)</span>
            </div>
            <div className="legend-item">
              <div className="legend-marker low"></div>
              <span>Low Risk (0 flags)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapWidget;