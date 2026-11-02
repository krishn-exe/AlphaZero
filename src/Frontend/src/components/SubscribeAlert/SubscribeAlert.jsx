import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { NER_DISTRICTS } from '../../data/districts';
import { requestPushPermissionAndToken } from '../../services/pushNotifications';
import './SubscribeAlert.css';

const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

function SubscribeAlert() {
  const { t } = useTranslation();

  // Navigation steps: 'form' | 'otp' | 'success' | 'settings'
  const [step, setStep] = useState('form');

  // Form states
  const [email, setEmail] = useState('');
  const [district, setDistrict] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [fcmToken, setFcmToken] = useState(null);

  // OTP states
  const [otp, setOtp] = useState('');
  const [otpTimeLeft, setOtpTimeLeft] = useState(15 * 60); // 15 minutes in seconds
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isExistingSubscriber, setIsExistingSubscriber] = useState(false);

  // Settings states
  const [settingsToken, setSettingsToken] = useState(null);
  const [settingsEmailEnabled, setSettingsEmailEnabled] = useState(true);
  const [settingsPushEnabled, setSettingsPushEnabled] = useState(false);
  const [settingsDistrict, setSettingsDistrict] = useState('');
  const [settingsSavedMsg, setSettingsSavedMsg] = useState(false);

  // UI status
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [pushNotice, setPushNotice] = useState('');

  // OTP Countdown timer
  const otpTimerRef = useRef(null);
  const resendTimerRef = useRef(null);

  useEffect(() => {
    if (step === 'otp') {
      otpTimerRef.current = setInterval(() => {
        setOtpTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(otpTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (otpTimerRef.current) clearInterval(otpTimerRef.current);
    }

    return () => {
      if (otpTimerRef.current) clearInterval(otpTimerRef.current);
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    };
  }, [step]);

  // Handle push notification toggle switch
  const handlePushToggle = async (checked, isSettings = false) => {
    setPushNotice('');
    if (!checked) {
      if (isSettings) {
        setSettingsPushEnabled(false);
      } else {
        setPushEnabled(false);
        setFcmToken(null);
      }
      return;
    }

    // User is turning push notifications ON -> request browser permission
    const result = await requestPushPermissionAndToken();
    if (result.granted) {
      if (isSettings) {
        setSettingsPushEnabled(true);
        if (result.token) {
          // Immediately sync token with backend in settings
          saveSettingsUpdate({ pushEnabled: true, fcmToken: result.token });
        }
      } else {
        setPushEnabled(true);
        setFcmToken(result.token);
      }
    } else {
      if (isSettings) setSettingsPushEnabled(false);
      else setPushEnabled(false);

      if (result.error === 'permission_denied') {
        setPushNotice(t('subscribe.pushPermissionDenied'));
      }
    }
  };

  // Step 1: Submit email to request OTP
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setStatus('error');
      setErrorMessage(t('subscribe.errorRequired'));
      return;
    }

    setStatus('loading');
    setErrorMessage('');
    setPushNotice('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          district: district || null,
          pushEnabled,
          fcmToken: pushEnabled ? fcmToken : null,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('idle');
        setIsExistingSubscriber(data.isExisting || false);
        setOtp('');
        setOtpTimeLeft(15 * 60);
        setResendCooldown(60);
        startResendTimer();
        setStep('otp');
      } else if (response.status === 429) {
        setStatus('error');
        setErrorMessage(t('subscribe.errorRateLimit'));
      } else {
        setStatus('error');
        setErrorMessage(data.error || t('subscribe.errorGeneric'));
      }
    } catch (err) {
      console.error('Subscription error:', err);
      setStatus('error');
      setErrorMessage(t('subscribe.errorNetwork'));
    }
  };

  // Step 2: Verify 6-digit OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp || otp.trim().length !== 6) {
      setStatus('error');
      setErrorMessage(t('subscribe.errorOtpRequired'));
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/subscribe/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          otp: otp.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('idle');
        setSettingsToken(data.settingsToken);
        setSettingsEmailEnabled(data.subscriber.emailEnabled ?? true);
        setSettingsPushEnabled(data.subscriber.pushEnabled ?? false);
        setSettingsDistrict(data.subscriber.districtName || district || '');

        if (data.isNewUser) {
          // New subscriber verified -> display success card
          setStep('success');
        } else {
          // Existing verified subscriber -> open user settings panel
          setStep('settings');
        }
      } else if (response.status === 400 && data.error && data.error.includes('expired')) {
        setStatus('error');
        setErrorMessage(t('subscribe.codeExpired'));
      } else {
        setStatus('error');
        setErrorMessage(data.error || t('subscribe.errorGeneric'));
      }
    } catch (err) {
      console.error('OTP verify error:', err);
      setStatus('error');
      setErrorMessage(t('subscribe.errorNetwork'));
    }
  };

  // Resend OTP code
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;

    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/subscribe/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();
      if (response.ok) {
        setStatus('idle');
        setOtpTimeLeft(15 * 60);
        setResendCooldown(60);
        startResendTimer();
      } else {
        setStatus('error');
        setErrorMessage(data.error || t('subscribe.errorGeneric'));
      }
    } catch (err) {
      console.error('Resend error:', err);
      setStatus('error');
      setErrorMessage(t('subscribe.errorNetwork'));
    }
  };

  const startResendTimer = () => {
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(resendTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Cancel/Back out of OTP verification
  const handleBackFromOtp = () => {
    setStep('form');
    setOtp('');
    setStatus('idle');
    setErrorMessage('');
  };

  // Settings: Save preferences update
  const saveSettingsUpdate = async (overrideData = {}) => {
    if (!settingsToken) return;
    setStatus('loading');
    setSettingsSavedMsg(false);
    setErrorMessage('');

    try {
      const payload = {
        emailEnabled: overrideData.emailEnabled ?? settingsEmailEnabled,
        pushEnabled: overrideData.pushEnabled ?? settingsPushEnabled,
        district: overrideData.district !== undefined ? overrideData.district : settingsDistrict,
        fcmToken: overrideData.fcmToken !== undefined ? overrideData.fcmToken : null,
      };

      const response = await fetch(`${API_BASE_URL}/api/subscribe/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settingsToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (response.ok) {
        setStatus('idle');
        setSettingsSavedMsg(true);
        setTimeout(() => setSettingsSavedMsg(false), 4000);
      } else {
        setStatus('error');
        setErrorMessage(data.error || t('subscribe.errorGeneric'));
      }
    } catch (err) {
      console.error('Settings save error:', err);
      setStatus('error');
      setErrorMessage(t('subscribe.errorNetwork'));
    }
  };

  // Settings: Unsubscribe and delete account
  const handleDeleteAccount = async () => {
    if (!window.confirm(t('subscribe.unsubscribeConfirm'))) {
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/subscribe/settings`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${settingsToken}`,
        },
      });

      if (response.ok) {
        setStatus('idle');
        setStep('form');
        setEmail('');
        setDistrict('');
        setPushEnabled(false);
        setSettingsToken(null);
        alert(t('subscribe.savedSuccess'));
      } else {
        const data = await response.json();
        setStatus('error');
        setErrorMessage(data.error || t('subscribe.errorGeneric'));
      }
    } catch (err) {
      console.error('Unsubscribe error:', err);
      setStatus('error');
      setErrorMessage(t('subscribe.errorNetwork'));
    }
  };

  const formatMinutes = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // ---------------- Render: Step 3 (Success) ----------------
  if (step === 'success') {
    return (
      <div className="subscribe-card">
        <div className="subscribe-success-panel">
          <div className="success-icon-badge">✓</div>
          <h3>{t('subscribe.successTitle')}</h3>
          <p className="success-subtext">
            {t('subscribe.successMsg', {
              district: district ? t(`districts.${district}`, { defaultValue: district }) : t('subscribe.allNer'),
            })}
          </p>
          <div className="success-action-row">
            <button
              type="button"
              className="btn-settings-pill"
              onClick={() => setStep('settings')}
            >
              ⚙ {t('subscribe.manageSettings')}
            </button>
            <button
              type="button"
              className="btn-done-pill"
              onClick={() => {
                setStep('form');
                setEmail('');
                setDistrict('');
              }}
            >
              {t('subscribe.close')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- Render: Step 4 (Settings Panel) ----------------
  if (step === 'settings') {
    return (
      <div className="subscribe-card settings-mode">
        <div className="subscribe-header">
          <span className="subscribe-icon">⚙</span>
          <h3>{t('subscribe.settingsTitle')}</h3>
        </div>
        <p className="subscribe-subtext">
          {t('subscribe.settingsEmailLabel')}: <strong>{email}</strong>
        </p>

        {settingsSavedMsg && (
          <div className="settings-alert-success">✓ {t('subscribe.savedSuccess')}</div>
        )}

        {errorMessage && (
          <p className="subscribe-error">⚠️ {errorMessage}</p>
        )}

        <div className="settings-controls">
          {/* Email toggle */}
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-title">{t('subscribe.emailAlertsToggle')}</span>
              <span className="settings-item-desc">{t('subscribe.emailAlertsDesc')}</span>
            </div>
            <label className="switch-toggle" aria-label="Toggle email alerts">
              <input
                type="checkbox"
                checked={settingsEmailEnabled}
                onChange={(e) => setSettingsEmailEnabled(e.target.checked)}
              />
              <span className="slider round"></span>
            </label>
          </div>

          {/* Push notification toggle */}
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-title">{t('subscribe.pushAlertsToggle')}</span>
              <span className="settings-item-desc">{t('subscribe.pushAlertsDesc')}</span>
            </div>
            <label className="switch-toggle" aria-label="Toggle push alerts">
              <input
                type="checkbox"
                checked={settingsPushEnabled}
                onChange={(e) => handlePushToggle(e.target.checked, true)}
              />
              <span className="slider round"></span>
            </label>
          </div>

          {/* District selector */}
          <div className="settings-item select-item">
            <div className="settings-item-info">
              <span className="settings-item-title">{t('subscribe.monitoredDistrict')}</span>
            </div>
            <select
              value={settingsDistrict}
              onChange={(e) => setSettingsDistrict(e.target.value)}
              className="district-select-pill"
            >
              <option value="">{t('subscribe.allNer')}</option>
              {NER_DISTRICTS.map((group) => (
                <optgroup
                  key={group.state}
                  label={t(`states.${group.state}`, { defaultValue: group.state })}
                >
                  {group.districts.map((d) => (
                    <option key={d} value={d}>
                      {t(`districts.${d}`, { defaultValue: d })}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <div className="settings-actions">
          <button
            type="button"
            className="btn-save-settings"
            onClick={() => saveSettingsUpdate()}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? t('subscribe.saving') : t('subscribe.saveSettings')}
          </button>
          <button
            type="button"
            className="btn-close-settings"
            onClick={() => setStep('form')}
          >
            {t('subscribe.close')}
          </button>
        </div>

        <div className="settings-danger-zone">
          <button
            type="button"
            className="btn-danger-delete"
            onClick={handleDeleteAccount}
            disabled={status === 'loading'}
          >
            🗑 {t('subscribe.unsubscribeBtn')}
          </button>
        </div>
      </div>
    );
  }

  // ---------------- Render: Step 2 (OTP Verification) ----------------
  if (step === 'otp') {
    return (
      <div className="subscribe-card otp-mode">
        <div className="subscribe-header">
          <span className="subscribe-icon">🔒</span>
          <h3>{t('subscribe.otpTitle')}</h3>
        </div>
        <p className="subscribe-subtext">
          {t('subscribe.otpSubtext')} <strong>{email}</strong>
        </p>

        {isExistingSubscriber && (
          <div className="info-banner">
            ℹ️ You already have an alert subscription. Verify the code to manage your alert preferences.
          </div>
        )}

        <form className="otp-form" onSubmit={handleVerifyOtp}>
          <div className="otp-input-wrap">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="• • • • • •"
              className="otp-field"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus
              required
            />
          </div>

          <div className="otp-timer-row">
            <span className="otp-timer">
              ⏱ {t('subscribe.codeExpiresIn', {
                minutes: Math.floor(otpTimeLeft / 60),
                seconds: otpTimeLeft % 60 < 10 ? `0${otpTimeLeft % 60}` : otpTimeLeft % 60,
              })}
            </span>

            <button
              type="button"
              className="btn-resend"
              disabled={resendCooldown > 0 || status === 'loading'}
              onClick={handleResendOtp}
            >
              {resendCooldown > 0
                ? t('subscribe.resendCountdown', { seconds: resendCooldown })
                : t('subscribe.resendCode')}
            </button>
          </div>

          {errorMessage && (
            <p className="subscribe-error">⚠️ {errorMessage}</p>
          )}

          <div className="otp-action-row">
            <button
              type="submit"
              className="btn-primary"
              disabled={otp.length !== 6 || status === 'loading'}
            >
              {status === 'loading' ? t('subscribe.verifying') : t('subscribe.verifyBtn')}
            </button>
            <button
              type="button"
              className="btn-back"
              onClick={handleBackFromOtp}
              disabled={status === 'loading'}
            >
              {t('subscribe.changeEmail')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ---------------- Render: Step 1 (Subscribe Form) ----------------
  return (
    <div className="subscribe-card">
      <div className="subscribe-header">
        <span className="subscribe-icon">🔔</span>
        <h3>{t('subscribe.title')}</h3>
      </div>
      <p className="subscribe-subtext">{t('subscribe.subtext')}</p>

      {pushNotice && (
        <div className="push-warning-notice">⚠️ {pushNotice}</div>
      )}

      {errorMessage && (
        <p className="subscribe-error">⚠️ {errorMessage}</p>
      )}

      <form className="subscribe-form" onSubmit={handleFormSubmit} noValidate>
        {/* Email & District Controls */}
        <div className="subscribe-inputs-row">
          <input
            type="email"
            placeholder={t('subscribe.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-email"
            required
          />

          <select
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            className="district-select-pill"
          >
            <option value="">{t('subscribe.districtPlaceholder')}</option>
            {NER_DISTRICTS.map((group) => (
              <optgroup
                key={group.state}
                label={t(`states.${group.state}`, { defaultValue: group.state })}
              >
                {group.districts.map((d) => (
                  <option key={d} value={d}>
                    {t(`districts.${d}`, { defaultValue: d })}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <button
            type="submit"
            className="btn-primary submit-btn"
            disabled={status === 'loading'}
          >
            {status === 'loading' ? t('subscribe.subscribing') : t('subscribe.subscribeBtn')}
          </button>
        </div>

        {/* Push Notification Toggle Row */}
        <div className="subscribe-toggle-row">
          <label className="push-toggle-control" htmlFor="push-notif-checkbox">
            <span className="switch-toggle">
              <input
                id="push-notif-checkbox"
                type="checkbox"
                checked={pushEnabled}
                onChange={(e) => handlePushToggle(e.target.checked, false)}
              />
              <span className="slider round"></span>
            </span>
            <span className="push-label-group">
              <strong className="push-title">{t('subscribe.pushToggle')}</strong>
              <small className="push-desc">{t('subscribe.pushToggleDesc')}</small>
            </span>
          </label>
        </div>
      </form>
    </div>
  );
}

export default SubscribeAlert;
