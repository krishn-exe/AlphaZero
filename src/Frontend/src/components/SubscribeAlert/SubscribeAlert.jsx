import { useState } from 'react';
import './SubscribeAlert.css';

const API_BASE_URL = 'https://land-slide-sih26.onrender.com';

const districts = [
  'Guwahati',
  'Shillong',
  'Itanagar',
  'Imphal',
  'Aizawl',
  // TODO: replace with full ~130 district list from backend teammate (districts.json)
];

function SubscribeAlert() {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [district, setDistrict] = useState('');
  const [showExtra, setShowExtra] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email) {
      setStatus('error');
      setErrorMessage('Email is required.');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          phone: phone || null,
          district: district || null,
        }),
      });

      if (response.status === 201) {
        setStatus('success');
        setEmail('');
        setPhone('');
        setDistrict('');
        setShowExtra(false);
      } else if (response.status === 429) {
        setStatus('error');
        setErrorMessage('Too many attempts. Please try again in a bit.');
      } else {
        const data = await response.json().catch(() => ({}));
        setStatus('error');
        setErrorMessage(data.error || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      console.error('Network error:', err);
      setStatus('error');
      setErrorMessage('Network error. Please check your connection.');
    }
  };

  if (status === 'success') {
    return (
      <div className="subscribe-card">
        <div className="subscribe-success">
          <span className="success-check">✓</span>
          <span>Subscribed! Check your email for confirmation.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="subscribe-card">
      <div className="subscribe-header">
        <span className="subscribe-icon">🔔</span>
        <h3>Get Landslide Alerts</h3>
      </div>
      <p className="subscribe-subtext">
        Stay informed about landslide risk in your district.
      </p>

      <form className="subscribe-form" onSubmit={handleSubmit} noValidate>
        <div className="subscribe-row">
          <input
            type="email"
            placeholder="Email address *"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Subscribing...' : 'Subscribe'}
          </button>
        </div>

        {!showExtra && (
          <button
            type="button"
            className="subscribe-toggle"
            onClick={() => setShowExtra(true)}
          >
            + Add phone number or district (optional)
          </button>
        )}

        {showExtra && (
          <div className="subscribe-extra">
           <input
  type="tel"
  placeholder="Phone number (optional)"
  value={phone}
  onChange={(e) => {
    const digitsOnly = e.target.value.replace(/\D/g, '');
    setPhone(digitsOnly.slice(0, 10)); // caps at 10 digits
  }}
  inputMode="numeric"
  maxLength={10}
/>
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            >
              <option value="">Select district (optional)</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        {status === 'error' && (
          <p className="subscribe-error">⚠️ {errorMessage}</p>
        )}
      </form>
    </div>
  );
}

export default SubscribeAlert;