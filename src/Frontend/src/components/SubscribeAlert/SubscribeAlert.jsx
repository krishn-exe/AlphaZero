import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [district, setDistrict] = useState('');
  const [showExtra, setShowExtra] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errorKey, setErrorKey] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email) {
      setStatus('error');
      setErrorKey('subscribe.errorRequired');
      return;
    }

    setStatus('loading');
    setErrorKey('');

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
        setErrorKey('subscribe.errorRateLimit');
      } else {
        setStatus('error');
        setErrorKey('subscribe.errorGeneric');
      }
    } catch (err) {
      console.error('Network error:', err);
      setStatus('error');
      setErrorKey('subscribe.errorNetwork');
    }
  };

  if (status === 'success') {
    return (
      <div className="subscribe-card">
        <div className="subscribe-success">
          <span className="success-check">✓</span>
          <span>{t('subscribe.successMsg')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="subscribe-card">
      <div className="subscribe-header">
        <span className="subscribe-icon">🔔</span>
        <h3>{t('subscribe.title')}</h3>
      </div>
      <p className="subscribe-subtext">{t('subscribe.subtext')}</p>

      <form className="subscribe-form" onSubmit={handleSubmit} noValidate>
        <div className="subscribe-row">
          <input
            type="email"
            placeholder={t('subscribe.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? t('subscribe.subscribing') : t('subscribe.subscribeBtn')}
          </button>
        </div>

        {!showExtra && (
          <button
            type="button"
            className="subscribe-toggle"
            onClick={() => setShowExtra(true)}
          >
            {t('subscribe.addOptional')}
          </button>
        )}

        {showExtra && (
          <div className="subscribe-extra">
            <input
              type="tel"
              placeholder={t('subscribe.phonePlaceholder')}
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
              <option value="">{t('subscribe.districtPlaceholder')}</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        {status === 'error' && (
          <p className="subscribe-error">⚠️ {t(errorKey)}</p>
        )}
      </form>
    </div>
  );
}

export default SubscribeAlert;