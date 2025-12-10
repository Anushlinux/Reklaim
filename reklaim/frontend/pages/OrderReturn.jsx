import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import './style/order_return.css';

// Mock product data for demo
const MOCK_PRODUCT = {
    id: 'prod_demo_001',
    name: 'Premium Cotton Classic Fit Shirt',
    variant: 'Size: L • Color: Navy Blue',
    price: 1299,
    image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&h=400&fit=crop',
    orderId: 'ORD-2024-78542',
    orderDate: 'December 5, 2024'
};

const RETURN_REASONS = [
    { id: 'size', label: 'Size Issue', icon: '📏', description: 'Too big or too small' },
    { id: 'color', label: 'Wrong Color', icon: '🎨', description: 'Color differs from shown' },
    { id: 'damaged', label: 'Damaged Item', icon: '📦', description: 'Received damaged' },
    { id: 'wrong', label: 'Wrong Item', icon: '❌', description: 'Received wrong product' },
    { id: 'quality', label: 'Quality Issue', icon: '⚠️', description: 'Not as expected' },
    { id: 'changed', label: 'Changed Mind', icon: '💭', description: 'No longer needed' }
];

const OrderReturn = () => {
    const { company_id } = useParams();
    const [selectedReason, setSelectedReason] = useState('');
    const [comments, setComments] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [response, setResponse] = useState(null);

    // Developer mode state (hidden from regular users)
    const [devMode, setDevMode] = useState(false);
    const [scenario, setScenario] = useState('clean');

    // Keyboard shortcut to toggle dev mode (Shift+D)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.shiftKey && e.key === 'D') {
                setDevMode(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleSubmit = async () => {
        if (!selectedReason) return;

        setLoading(true);
        try {
            const { data } = await axios.post('/api/simulate-return', {
                scenario,
                company_id,
                reason: selectedReason,
                comments
            });

            setResponse(data);
            setSubmitted(true);
        } catch (err) {
            console.error('Return submission error:', err);
            setResponse({
                success: false,
                error: err.response?.data?.error || err.message
            });
            setSubmitted(true);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setSubmitted(false);
        setResponse(null);
        setSelectedReason('');
        setComments('');
    };

    if (submitted) {
        return (
            <div className="order-return-container">
                <div className={`result-container ${response?.success ? 'success' : 'error'}`}>
                    <div className="result-icon">
                        {response?.success ? '✓' : '✗'}
                    </div>
                    <h2 className="result-title">
                        {response?.success ? 'Return Request Submitted' : 'Submission Failed'}
                    </h2>
                    <p className="result-message">
                        {response?.success
                            ? 'Your return request has been received and is being processed. You will receive an email confirmation shortly.'
                            : response?.error || 'Something went wrong. Please try again.'}
                    </p>

                    {response?.success && (
                        <div className="result-details">
                            <div className="detail-row">
                                <span className="detail-label">Return ID</span>
                                <span className="detail-value">{response?.payload?.return_id}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Status</span>
                                <span className="detail-value status-badge">Processing</span>
                            </div>
                        </div>
                    )}

                    <button className="btn btn-primary" onClick={handleReset}>
                        Submit Another Return
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="order-return-container">
            {/* Header */}
            <header className="return-header">
                <div className="header-content">
                    <h1>Request a Return</h1>
                    <p>We're sorry to see this item go. Let us know what happened.</p>
                </div>
                <div className="order-badge">
                    Order #{MOCK_PRODUCT.orderId}
                </div>
            </header>

            {/* Product Card */}
            <section className="product-card">
                <img
                    src={MOCK_PRODUCT.image}
                    alt={MOCK_PRODUCT.name}
                    className="product-image"
                />
                <div className="product-info">
                    <h3 className="product-name">{MOCK_PRODUCT.name}</h3>
                    <p className="product-variant">{MOCK_PRODUCT.variant}</p>
                    <p className="product-price">₹{MOCK_PRODUCT.price.toLocaleString()}</p>
                    <span className="order-date">Ordered on {MOCK_PRODUCT.orderDate}</span>
                </div>
            </section>

            {/* Return Reason Selection */}
            <section className="form-section">
                <h2 className="section-title">
                    <span className="step-number">1</span>
                    Why are you returning this item?
                </h2>
                <div className="reasons-grid">
                    {RETURN_REASONS.map((reason) => (
                        <div
                            key={reason.id}
                            className={`reason-card ${selectedReason === reason.id ? 'selected' : ''}`}
                            onClick={() => setSelectedReason(reason.id)}
                        >
                            <span className="reason-icon">{reason.icon}</span>
                            <span className="reason-label">{reason.label}</span>
                            <span className="reason-description">{reason.description}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* Additional Comments */}
            <section className="form-section">
                <h2 className="section-title">
                    <span className="step-number">2</span>
                    Additional Details <span className="optional">(Optional)</span>
                </h2>
                <div className="comment-section">
                    <textarea
                        className="comment-textarea"
                        placeholder="Tell us more about the issue. This helps us serve you better..."
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        maxLength={500}
                    />
                    <span className="char-count">{comments.length}/500</span>
                </div>
            </section>

            {/* Developer Mode Toggle (Hidden) */}
            {devMode && (
                <section className="dev-mode-panel">
                    <div className="dev-mode-header">
                        <span className="dev-icon">🛠️</span>
                        <span>Developer Mode</span>
                    </div>
                    <div className="dev-mode-controls">
                        <label className="dev-label">Test Scenario:</label>
                        <select
                            className="dev-select"
                            value={scenario}
                            onChange={(e) => setScenario(e.target.value)}
                        >
                            <option value="clean">Clean Return (Legitimate)</option>
                            <option value="fraud">Fraud Pattern (Suspicious)</option>
                        </select>
                    </div>
                    <p className="dev-hint">Press Shift+D to hide this panel</p>
                </section>
            )}

            {/* Submit Actions */}
            <section className="actions-section">
                <button className="btn btn-secondary">
                    Cancel
                </button>
                <button
                    className="btn btn-primary"
                    onClick={handleSubmit}
                    disabled={!selectedReason || loading}
                >
                    {loading ? (
                        <span className="loading-spinner"></span>
                    ) : (
                        'Submit Return Request'
                    )}
                </button>
            </section>

            {/* Footer hint for dev mode */}
            <footer className="return-footer">
                <p className="footer-text">
                    Returns are processed within 3-5 business days after receiving the item.
                </p>
            </footer>
        </div>
    );
};

export default OrderReturn;
