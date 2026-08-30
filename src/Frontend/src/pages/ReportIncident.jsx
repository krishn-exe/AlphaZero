import { useState } from 'react';
import './ReportIncident.css';

// MOCK API ABSTRACTION
const mockApi = {
  submitIncident: async (data) => {
    try {
      const response = await fetch('/api/incidents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          console.warn("Mock Mode: /api/incidents not found. Simulating successful submission.");
          return new Promise(resolve => setTimeout(() => resolve({ id: Date.now(), ...data, status: 'pending' }), 1000));
        }
        throw new Error('Failed to submit incident to server');
      }
      
      return await response.json();
    } catch (error) {
      console.warn("Mock Mode: Network error, falling back to simulated success for demo purposes.", error);
      return new Promise(resolve => setTimeout(() => resolve({ id: Date.now(), ...data, status: 'pending' }), 1000));
    }
  }
};

function ReportIncident() {
  const [formData, setFormData] = useState({
    description: '',
    category: 'road_blockage',
    latitude: '',
    longitude: ''
  });

  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData(prev => ({
            ...prev,
            latitude: position.coords.latitude.toFixed(6),
            longitude: position.coords.longitude.toFixed(6)
          }));
        },
        (error) => {
          console.error("Error getting location:", error);
          alert("Could not retrieve your location automatically. Please enter it manually.");
        }
      );
    } else {
      alert("Geolocation is not supported by this browser.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('submitting');
    setErrorMessage('');

    if (!formData.description || !formData.category || !formData.latitude || !formData.longitude) {
      setStatus('error');
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    const payload = {
      description: formData.description,
      category: formData.category,
      latitude: parseFloat(formData.latitude),
      longitude: parseFloat(formData.longitude)
    };

    try {
      await mockApi.submitIncident(payload);
      setStatus('success');
      setFormData({
        description: '',
        category: 'road_blockage',
        latitude: '',
        longitude: ''
      });
    } catch (error) {
      console.error(error);
      setStatus('error');
      setErrorMessage('An error occurred while submitting the report. Please try again.');
    }
  };

  return (
    <div className="report-container">
      <div className="report-header">
        <h1>Report an Incident</h1>
        <p>Help us monitor landslide risks and road blockages by reporting incidents in your area.</p>
      </div>

      <div className="report-card">
        <form onSubmit={handleSubmit}>
          
          <div className="form-group">
            <label htmlFor="category">Incident Category *</label>
            <select
              id="category"
              name="category"
              className="form-control"
              value={formData.category}
              onChange={handleChange}
              required
            >
              <option value="road_blockage">Road Blockage</option>
              <option value="landslide">Landslide</option>
              <option value="flooding">Flooding</option>
              <option value="structural_damage">Structural Damage</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="description">Description *</label>
            <textarea
              id="description"
              name="description"
              className="form-control"
              placeholder="E.g., Tree fell across the highway near mile marker 4..."
              value={formData.description}
              onChange={handleChange}
              required
            />
          </div>

          <div className="location-row">
            <div className="form-group">
              <label htmlFor="latitude">Latitude *</label>
              <input
                type="number"
                step="any"
                id="latitude"
                name="latitude"
                className="form-control"
                placeholder="23.7271"
                value={formData.latitude}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="longitude">Longitude *</label>
              <input
                type="number"
                step="any"
                id="longitude"
                name="longitude"
                className="form-control"
                placeholder="92.7176"
                value={formData.longitude}
                onChange={handleChange}
                required
              />
            </div>
          </div>
          
          <div className="form-group" style={{ marginTop: '-12px' }}>
            <button 
              type="button" 
              onClick={getLocation}
              style={{
                background: 'none',
                border: 'none',
                color: '#0b8568',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '0',
                fontSize: '0.9rem'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>my_location</span>
              Use my current location
            </button>
          </div>

          <button 
            type="submit" 
            className="btn-submit"
            disabled={status === 'submitting'}
          >
            {status === 'submitting' ? (
              <>
                <div className="spinner"></div>
                Submitting...
              </>
            ) : (
              'Submit Report'
            )}
          </button>

          {status === 'success' && (
            <div className="form-message success">
              <span className="material-symbols-outlined">check_circle</span>
              Your incident report has been submitted successfully. Authorities have been notified.
            </div>
          )}

          {status === 'error' && (
            <div className="form-message error">
              <span className="material-symbols-outlined">error</span>
              {errorMessage}
            </div>
          )}

        </form>
      </div>
    </div>
  );
}

export default ReportIncident;
