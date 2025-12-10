import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const Settings = () => {
    const { company_id } = useParams();
    const [bolticUrl, setBolticUrl] = useState('');
    const [threshold, setThreshold] = useState(500);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadConfig();
    }, [company_id]);

    const loadConfig = async () => {
        try {
            const { data } = await axios.get(`/api/config/${company_id}`);
            setBolticUrl(data.boltic_url || '');
            setThreshold(data.rules?.auto_approve_threshold || 500);
        } catch (err) {
            console.error('Load config error:', err);
        }
    };

    const saveConfig = async () => {
        setLoading(true);
        try {
            await axios.post(`/api/config/${company_id}`, {
                boltic_url: bolticUrl,
                rules: { auto_approve_threshold: parseInt(threshold), enable_ai: true }
            });
            setMessage('✅ Configuration saved successfully!');
            setTimeout(() => setMessage(''), 3000);
        } catch (err) {
            setMessage('❌ Save failed: ' + err.message);
        }
        setLoading(false);
    };

    const testReturn = async (scenario) => {
        try {
            const { data } = await axios.post('/api/simulate-return', { scenario, company_id });

            if (data.success) {
                if (data.boltic_error) {
                    alert(`⚠️ Test sent but Boltic returned error (${data.boltic_error}).\n\n${data.note}\n\nPayload was sent successfully though!`);
                } else {
                    alert(`✅ ${scenario.toUpperCase()} test triggered successfully!\n\nCheck your Boltic dashboard for execution.\n\nStatus: ${data.boltic_status || 'OK'}`);
                }
            } else {
                // Show detailed error information
                let errorMsg = `❌ ${data.message || 'Test failed'}\n\n`;
                errorMsg += `Error: ${data.boltic_error}\n\n`;
                if (data.boltic_error_details) {
                    errorMsg += `Details: ${JSON.stringify(data.boltic_error_details, null, 2)}\n\n`;
                }
                errorMsg += `${data.note}`;
                alert(errorMsg);
            }
        } catch (err) {
            const errorMsg = err.response?.data?.error || err.message;
            alert(`❌ Test failed: ${errorMsg}`);
        }
    };

    return (
        <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
                🛡️ Returns Guardian Settings
            </h1>

            <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                    Boltic Workflow URL
                </label>
                <input
                    type="text"
                    value={bolticUrl}
                    onChange={(e) => setBolticUrl(e.target.value)}
                    placeholder="https://api.boltic.io/workflow/YOUR_ID/webhook"
                    style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #ddd',
                        borderRadius: '4px'
                    }}
                />
                <small style={{ color: '#666' }}>Get this from your Boltic workflow dashboard</small>
            </div>

            <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                    Auto-Approve Threshold (₹)
                </label>
                <input
                    type="number"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    style={{
                        width: '200px',
                        padding: '10px',
                        border: '1px solid #ddd',
                        borderRadius: '4px'
                    }}
                />
                <small style={{ color: '#666', display: 'block', marginTop: '4px' }}>
                    Returns below this amount get auto-approved (if low risk)
                </small>
            </div>

            <button
                onClick={saveConfig}
                disabled={loading}
                style={{
                    backgroundColor: '#2563eb',
                    color: 'white',
                    padding: '10px 24px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontWeight: '500'
                }}
            >
                {loading ? 'Saving...' : 'Save Configuration'}
            </button>

            {message && (
                <div style={{
                    marginTop: '12px',
                    padding: '10px',
                    backgroundColor: message.includes('✅') ? '#d1fae5' : '#fee2e2',
                    borderRadius: '4px'
                }}>
                    {message}
                </div>
            )}

            <hr style={{ margin: '32px 0' }} />

            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>
                Test Workflow
            </h2>
            <div style={{ display: 'flex', gap: '12px' }}>
                <button
                    onClick={() => testReturn('fraud')}
                    style={{
                        backgroundColor: '#dc2626',
                        color: 'white',
                        padding: '10px 20px',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    🔴 Test Fraud Case
                </button>
                <button
                    onClick={() => testReturn('clean')}
                    style={{
                        backgroundColor: '#16a34a',
                        color: 'white',
                        padding: '10px 20px',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    🟢 Test Clean Return
                </button>
            </div>
            <p style={{ marginTop: '12px', fontSize: '14px', color: '#666' }}>
                These buttons simulate return webhooks to test your Boltic workflow.
            </p>
        </div>
    );
};

export default Settings;
