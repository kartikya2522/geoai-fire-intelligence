import { useState, useCallback } from 'react';
import axios from 'axios';

const API = 'http://localhost:8000';

export function usePrediction() {
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const predict = useCallback(async (formData) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.post(`${API}/predict`, formData);
      setResult(data);
      return data;
    } catch (err) {
      const detail = err.response?.data?.detail;

      if (err.response?.status === 422 && Array.isArray(detail)) {
        const hasLatLng = detail.some(d => {
          const field = d.loc?.[d.loc.length - 1] || '';
          return field === 'Latitude' || field === 'Longitude';
        });
        if (hasLatLng) {
          setError('Coordinates out of range. This model is trained on California data only — Latitude: 32–42°N, Longitude: −125 to −114°W.');
        } else {
          const msgs = detail.map(d => `${d.loc?.[d.loc.length - 1] || 'field'}: ${d.msg}`).join(', ');
          setError(`Invalid input — ${msgs}`);
        }
      } else if (typeof detail === 'string') {
        setError(detail);
      } else if (detail) {
        setError(JSON.stringify(detail));
      } else {
        setError('Prediction failed. Is the API running on port 8000?');
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => { setResult(null); setError(null); }, []);

  return { result, loading, error, predict, reset };
}

export async function fetchAnalytics() {
  const { data } = await axios.get(`${API}/analytics`);
  return data;
}

export async function fetchModelInfo() {
  const { data } = await axios.get(`${API}/model-info`);
  return data;
}
