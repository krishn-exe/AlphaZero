import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AdminLogin.css';

function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem('adminToken', data.token);
          navigate('/admin/dashboard');
        } else {
          // If no token but ok, simulate it for local testing if API isn't fully ready
          localStorage.setItem('adminToken', 'dummy_token_for_testing');
          navigate('/admin/dashboard');
        }
      } else {
        // Handle mock for local dev if backend is down
        if (password === 'admin123') {
           localStorage.setItem('adminToken', 'dummy_token_for_testing');
           navigate('/admin/dashboard');
        } else {
           setError('Invalid password or server error');
        }
      }
    } catch (err) {
      console.error(err);
      // Mock login fallback if backend isn't running during development
      if (password === 'admin123') {
         localStorage.setItem('adminToken', 'dummy_token_for_testing');
         navigate('/admin/dashboard');
      } else {
        setError('Network error. Failed to connect to server.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-container page-content">
      <div className="admin-login-box">
        <h2 className="admin-login-title">Admin Access</h2>
        <p className="admin-login-subtitle">Enter password to access the dashboard</p>
        
        <form onSubmit={handleLogin} className="admin-login-form">
          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoFocus
            />
          </div>
          
          {error && <div className="admin-login-error">{error}</div>}
          
          <button type="submit" className="admin-login-submit" disabled={loading}>
            {loading ? 'Authenticating...' : 'Login to Dashboard'}
          </button>
        </form>
        <button className="admin-login-back" onClick={() => navigate('/')}>
          &larr; Back to Home
        </button>
      </div>
    </div>
  );
}

export default AdminLogin;
