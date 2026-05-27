// useLocation.js — browser geolocation + reverse geocode (Nominatim, free, no key)
import { useState, useCallback } from 'react';

export function useDeliveryLocation() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const getLocation = useCallback(async (onResult) => {
    setError('');
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          // Reverse geocode with Nominatim (OpenStreetMap — free, no API key)
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`,
            { headers: { 'User-Agent': 'Kamili-Store/1.0' } }
          );
          const data = await res.json();

          const addr = data.address;
          const parts = [
            addr.road || addr.pedestrian || addr.suburb,
            addr.suburb || addr.neighbourhood,
            addr.city   || addr.town || addr.county,
          ].filter(Boolean);

          const humanAddress  = parts.join(', ');
          const mapsLink      = `https://maps.google.com/?q=${lat},${lng}`;
          const fullAddress   = `${humanAddress}\nMaps: ${mapsLink}`;

          onResult({ humanAddress, mapsLink, fullAddress, lat, lng });
        } catch (_) {
          // Fallback: just provide coordinates + Google Maps link
          const mapsLink = `https://maps.google.com/?q=${lat},${lng}`;
          onResult({ humanAddress: '', mapsLink, fullAddress: `Location: ${mapsLink}`, lat, lng });
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        setLoading(false);
        if (err.code === 1) setError('Location permission denied. Please type your address.');
        else                setError('Could not get location. Please type your address.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  return { getLocation, loading, error };
}
