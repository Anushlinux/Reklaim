import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './style/order_return.css';

// Default product data fallback
const DEFAULT_PRODUCT = {
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
    const { company_id, product_id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    const [selectedReason, setSelectedReason] = useState('');
    const [comments, setComments] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [response, setResponse] = useState(null);
    const [uploadedImages, setUploadedImages] = useState([]);
    const [isDragging, setIsDragging] = useState(false);

    // Developer mode state (hidden from regular users)
    const [devMode, setDevMode] = useState(false);
    const [scenario, setScenario] = useState('clean');

    // Get product from navigation state or use default
    const productFromState = location.state?.product;
    const product = productFromState ? {
        id: productFromState.id,
        name: productFromState.name,
        variant: productFromState.brand ? `Brand: ${productFromState.brand}` : '',
        price: 0, // Will be shown if available
        image: productFromState.image,
        orderId: `ORD-${Date.now().toString().slice(-8)}`,
        orderDate: new Date().toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        }),
        category: productFromState.category,
        itemCode: productFromState.itemCode
    } : DEFAULT_PRODUCT;

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

    // Image upload handling
    const handleImageUpload = (files) => {
        const validFiles = Array.from(files).filter(file => {
            const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
            const maxSize = 10 * 1024 * 1024; // 10MB
            return validTypes.includes(file.type) && file.size <= maxSize;
        });

        if (uploadedImages.length + validFiles.length > 5) {
            alert('You can upload a maximum of 5 images');
            return;
        }

        const newImages = validFiles.map(file => ({
            id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            file,
            preview: URL.createObjectURL(file),
            name: file.name
        }));

        setUploadedImages(prev => [...prev, ...newImages]);
    };

    const handleFileInputChange = (e) => {
        if (e.target.files) {
            handleImageUpload(e.target.files);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files) {
            handleImageUpload(e.dataTransfer.files);
        }
    };

    const removeImage = (imageId) => {
        setUploadedImages(prev => {
            const updated = prev.filter(img => img.id !== imageId);
            // Revoke URL of removed image to free memory
            const removed = prev.find(img => img.id === imageId);
            if (removed) {
                URL.revokeObjectURL(removed.preview);
            }
            return updated;
        });
    };

    // Cleanup URLs on unmount
    useEffect(() => {
        return () => {
            uploadedImages.forEach(img => URL.revokeObjectURL(img.preview));
        };
    }, []);

    const handleSubmit = async () => {
        if (!selectedReason) return;

        setLoading(true);
        try {
            const { data } = await axios.post('/api/simulate-return', {
                scenario,
                company_id,
                product_id: product.id,
                reason: selectedReason,
                comments,
                imageCount: uploadedImages.length
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
        setUploadedImages([]);
    };

    const handleGoBack = () => {
        navigate(-1);
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
                                <span className="detail-label">Product</span>
                                <span className="detail-value">{product.name}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Images Attached</span>
                                <span className="detail-value">{uploadedImages.length}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Status</span>
                                <span className="detail-value status-badge">Processing</span>
                            </div>
                        </div>
                    )}

                    <div className="result-actions">
                        <button className="btn btn-secondary" onClick={handleGoBack}>
                            Back to Products
                        </button>
                        <button className="btn btn-primary" onClick={handleReset}>
                            Submit Another Return
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="order-return-container">
            {/* Header */}
            <header className="return-header">
                <div className="header-content">
                    <button className="back-button" onClick={handleGoBack}>
                        ← Back
                    </button>
                    <h1>Request a Return</h1>
                    <p>We're sorry to see this item go. Let us know what happened.</p>
                </div>
                <div className="order-badge">
                    Order #{product.orderId}
                </div>
            </header>

            {/* Product Card */}
            <section className="product-card">
                <img
                    src={product.image}
                    alt={product.name}
                    className="product-image"
                />
                <div className="product-info">
                    <h3 className="product-name">{product.name}</h3>
                    {product.variant && <p className="product-variant">{product.variant}</p>}
                    {product.category && (
                        <span className="product-category-tag">{product.category}</span>
                    )}
                    {product.price > 0 && (
                        <p className="product-price">₹{product.price.toLocaleString()}</p>
                    )}
                    <span className="order-date">Ordered on {product.orderDate}</span>
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

            {/* Image Upload Section */}
            <section className="form-section">
                <h2 className="section-title">
                    <span className="step-number">3</span>
                    Attach Photos <span className="optional">(Optional)</span>
                </h2>
                <p className="section-subtitle">
                    Upload photos showing the issue with your product. Maximum 5 images.
                </p>

                {/* Drop Zone */}
                <div
                    className={`upload-zone ${isDragging ? 'dragging' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        onChange={handleFileInputChange}
                        className="file-input-hidden"
                    />
                    <div className="upload-icon">📸</div>
                    <div className="upload-text">
                        <span className="upload-primary">
                            {isDragging ? 'Drop images here' : 'Click to upload or drag and drop'}
                        </span>
                        <span className="upload-secondary">
                            JPG, PNG or WebP (Max 10MB each)
                        </span>
                    </div>
                </div>

                {/* Image Previews */}
                {uploadedImages.length > 0 && (
                    <div className="image-previews">
                        {uploadedImages.map((img) => (
                            <div key={img.id} className="preview-item">
                                <img src={img.preview} alt={img.name} className="preview-image" />
                                <button
                                    className="preview-remove"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeImage(img.id);
                                    }}
                                    aria-label="Remove image"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {uploadedImages.length > 0 && (
                    <p className="upload-count">{uploadedImages.length} of 5 images uploaded</p>
                )}
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
                <button className="btn btn-secondary" onClick={handleGoBack}>
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
