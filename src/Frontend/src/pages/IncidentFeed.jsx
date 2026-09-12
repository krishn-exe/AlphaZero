import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NER_DISTRICTS } from '../data/districts';
import './IncidentFeed.css';


// MOCK API ABSTRACTION — mirrors ReportIncident.jsx's mockApi pattern
const mockApi = {
  fetchIncidents: async (district) => {
    const params = new URLSearchParams({ status: 'verified' });
    if (district) params.append('district', district);

    try {
      const response = await fetch(`/api/incidents?${params.toString()}`);

      if (!response.ok) {
        if (response.status === 404) {
          console.warn('Mock Mode: /api/incidents not found. Using mock feed data.');
          return simulateFetch(district);
        }
        throw new Error('Failed to fetch incidents from server');
      }

      return await response.json();
    } catch (error) {
      console.warn('Mock Mode: Network error, falling back to mock feed data.', error);
      return simulateFetch(district);
    }
  }
};

// TODO: remove once /api/incidents is live. 'district' matches the exact
// value the user picks from NER_DISTRICTS on the report form.
const MOCK_INCIDENTS = [
  {
    id: '1',
    category: 'landslide',
    description: 'Debris flow blocking NH-6 near Sohra.',
    photoUrl: 'https://placehold.co/600x400?text=Report+1',
    latitude: 25.2854,
    longitude: 91.7362,
    district: 'East Khasi Hills',
    status: 'verified',
    reportedAt: '2026-09-07T09:15:00Z',
  },
  {
    id: '2',
    category: 'road_blockage',
    description: 'Cracks on road shoulder after heavy rain.',
    photoUrl: null,
    latitude: 26.1445,
    longitude: 91.7362,
    district: 'Kamrup Metropolitan',
    status: 'verified',
    reportedAt: '2026-09-07T13:40:00Z',
  },
  {
    id: '3',
    category: 'flooding',
    description: 'Stream overflow near village access road.',
    photoUrl: 'https://placehold.co/600x400?text=Report+3',
    latitude: 27.2333,
    longitude: 88.2167,
    district: 'West Sikkim',
    status: 'verified',
    reportedAt: '2026-09-08T05:05:00Z',
  },
  {
    id: '4',
    category: 'structural_damage',
    description: 'Retaining wall showing cracks after tremors.',
    photoUrl: null,
    latitude: 25.5788,
    longitude: 91.8933,
    district: 'East Khasi Hills',
    status: 'verified',
    reportedAt: '2026-09-08T18:20:00Z',
  },
];

function simulateFetch(district) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const filtered = district
        ? MOCK_INCIDENTS.filter((i) => i.district === district)
        : MOCK_INCIDENTS;
      resolve(
        [...filtered].sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt))
      );
    }, 600);
  });
}

const CATEGORY_ICONS = {
  landslide: 'landslide',
  road_blockage: 'block',
  flooding: 'water',
  structural_damage: 'apartment',
  other: 'report',
};

function timeAgo(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function IncidentFeed() {
  const { t } = useTranslation();

  const [incidents, setIncidents] = useState([]);
  const [districtFilter, setDistrictFilter] = useState('');
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    mockApi.fetchIncidents(districtFilter)
      .then((data) => {
        if (cancelled) return;
        setIncidents(data);
        setStatus('success');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });

    return () => { cancelled = true; };
  }, [districtFilter]);

  return (
    <div className="feed-container">
      <div className="feed-header">
        <h1>{t('feedPage.title')}</h1>
        <p>{t('feedPage.subtitle')}</p>

        <div className="form-group feed-filter-group">
          <label htmlFor="districtFilter">{t('feedPage.filterLabel')}</label>
          <select
            id="districtFilter"
            className="form-control"
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
          >
            <option value="">{t('feedPage.allDistricts')}</option>
            {NER_DISTRICTS.map((group) => (
              <optgroup key={group.state} label={group.state}>
                {group.districts.map((district) => (
                  <option key={district} value={district}>{district}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {status === 'loading' && (
        <div className="feed-message">
          <div className="spinner"></div>
          {t('feedPage.loading')}
        </div>
      )}

      {status === 'error' && (
        <div className="feed-message error">
          <span className="material-symbols-outlined">error</span>
          {t('feedPage.errorGeneric')}
        </div>
      )}

      {status === 'success' && incidents.length === 0 && (
        <div className="feed-message">
          <span className="material-symbols-outlined">inbox</span>
          {t('feedPage.empty')}
        </div>
      )}

      {status === 'success' && incidents.length > 0 && (
        <div className="feed-grid">
          {incidents.map((incident) => (
            <div className="feed-card" key={incident.id}>
              <div className="feed-card-tag">
                <span className="material-symbols-outlined">
                  {CATEGORY_ICONS[incident.category] || 'report'}
                </span>
                {t(`reportPage.categories.${incident.category}`)}
              </div>
              <h3>{incident.district}</h3>
              <p className="feed-card-description">{incident.description}</p>
              <div className="feed-card-meta">
                <span>{timeAgo(incident.reportedAt)}</span>
                <span className="feed-card-verified">
                  <span className="material-symbols-outlined">verified</span>
                  {t('feedPage.verified')}
                </span>
              </div>
              <button
                type="button"
                className="feed-view-btn"
                onClick={() => setSelected(incident)}
              >
                {t('feedPage.viewReport')}
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="feed-modal-overlay" onClick={() => setSelected(null)}>
          <div className="feed-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="feed-modal-close"
              onClick={() => setSelected(null)}
            >
              <span className="material-symbols-outlined">close</span>
            </button>

            {selected.photoUrl ? (
              <img src={selected.photoUrl} alt={selected.category} className="feed-modal-photo" />
            ) : (
              <div className="feed-modal-no-photo">
                <span className="material-symbols-outlined">image_not_supported</span>
                {t('feedPage.noPhoto')}
              </div>
            )}

            <div className="feed-card-tag">
              <span className="material-symbols-outlined">
                {CATEGORY_ICONS[selected.category] || 'report'}
              </span>
              {t(`reportPage.categories.${selected.category}`)}
            </div>
            <h3>{selected.district}</h3>
            <p>{selected.description}</p>
            <p className="feed-modal-coords">
              <span className="material-symbols-outlined">my_location</span>
              {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
            </p>
            <p className="feed-modal-time">{timeAgo(selected.reportedAt)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default IncidentFeed;
