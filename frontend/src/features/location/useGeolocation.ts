import { useEffect, useRef, useState } from "react";

export const MAX_LOCATION_ACCURACY = 1000;
export function useGeolocation() {
  const generation = useRef(0);
  const [position, setPosition] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => { generation.current += 1; }, []);
  function clear() { generation.current += 1; setPosition(null); setLoading(false); setError(""); }
  function request() {
    clear();
    if (!window.isSecureContext) { setError("GPS requires a secure connection. Use HTTPS or enter your location manually."); return; }
    if (!window.navigator.geolocation) { setError("This browser does not support GPS. Enter your location manually."); return; }
    const current = generation.current;
    setLoading(true);
    try {
      window.navigator.geolocation.getCurrentPosition(result => {
        if (current !== generation.current) return;
        setLoading(false);
        const { latitude, longitude, accuracy } = result.coords;
        if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180 || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > MAX_LOCATION_ACCURACY) {
          setError("Your position is not accurate enough for a neighborhood. Try again near a window or enter your location manually."); return;
        }
        setPosition({ latitude, longitude, accuracy });
      }, failure => {
        if (current !== generation.current) return;
        setLoading(false);
        setError(failure.code === 1 ? "Location permission was denied. You can try again or choose manual entry." : failure.code === 3 ? "Finding your location timed out. Try again or choose manual entry." : "Your position is unavailable. Try again or choose manual entry.");
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    } catch {
      if (current === generation.current) { setLoading(false); setError("GPS could not be started. Try again or choose manual entry."); }
    }
  }
  return { position, loading, error, request, clear };
}
