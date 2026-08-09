'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useRideStore } from '../store/useRideStore';

const createPin = (color: string, label: string) => L.divIcon({
  className: 'bg-transparent',
  html: `<div class="map-pin" style="--pin-color:${color}"><span>${label}</span></div>`,
  iconSize: [34, 42],
  iconAnchor: [17, 42],
});

const createVehicle = (type: string) => {
  const color = type === 'Bus' ? '#b8f36b' : type === 'Shuttle' ? '#f5bf5f' : '#7dd3fc';
  return L.divIcon({
    className: 'bg-transparent',
    html: `<div class="vehicle-pin" style="--vehicle-color:${color}"><span></span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

export default function MapView() {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const clickModeRef = useRef<'origin' | 'destination'>('origin');
  const originMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
  const routeRef = useRef<L.Polyline | null>(null);
  const vehicleRef = useRef<L.Marker | null>(null);
  const otherVehiclesRef = useRef<L.Marker[]>([]);
  const { origin, destination, setOrigin, setDestination, activeRoute, activeRideId, matches } = useRideStore();
  const [clickMode, setClickMode] = useState<'origin' | 'destination'>('origin');

  useEffect(() => {
    clickModeRef.current = clickMode;
  }, [clickMode]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [22.5726, 88.4497], zoom: 13, zoomControl: false, attributionControl: false });
    mapRef.current = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19 }).addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => {
      const location = { lat: event.latlng.lat, lng: event.latlng.lng };
      if (clickModeRef.current === 'origin') {
        setOrigin(location);
        setClickMode('destination');
      } else {
        setDestination(location);
        setClickMode('origin');
      }
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [setDestination, setOrigin]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (origin) {
      if (!originMarkerRef.current) originMarkerRef.current = L.marker([origin.lat, origin.lng], { icon: createPin('#7dd3fc', 'A') }).addTo(mapRef.current);
      else originMarkerRef.current.setLatLng([origin.lat, origin.lng]);
    } else if (originMarkerRef.current) {
      originMarkerRef.current.remove();
      originMarkerRef.current = null;
    }
    if (destination) {
      if (!destinationMarkerRef.current) destinationMarkerRef.current = L.marker([destination.lat, destination.lng], { icon: createPin('#fb7185', 'B') }).addTo(mapRef.current);
      else destinationMarkerRef.current.setLatLng([destination.lat, destination.lng]);
    } else if (destinationMarkerRef.current) {
      destinationMarkerRef.current.remove();
      destinationMarkerRef.current = null;
    }
  }, [origin, destination]);

  useEffect(() => {
    if (!mapRef.current) return;
    otherVehiclesRef.current.forEach((marker) => marker.remove());
    otherVehiclesRef.current = matches.filter((match) => match.ride_id !== activeRideId).map((match) => L.marker(
      [match.telemetry.driver_lat, match.telemetry.driver_lon],
      { icon: createVehicle(match.vehicle_type) },
    ).addTo(mapRef.current!));
  }, [matches, activeRideId]);

  useEffect(() => {
    if (!mapRef.current || !activeRoute || activeRoute.path_to_pickup.length < 2) {
      routeRef.current?.remove();
      vehicleRef.current?.remove();
      routeRef.current = null;
      vehicleRef.current = null;
      return;
    }
    const path = activeRoute.path_to_pickup;
    routeRef.current?.remove();
    routeRef.current = L.polyline(path, { color: '#7dd3fc', weight: 4, opacity: 0.9, dashArray: '8 10', lineCap: 'round' }).addTo(mapRef.current);
    mapRef.current.fitBounds(routeRef.current.getBounds(), { padding: [70, 70] });
    vehicleRef.current?.remove();
    const match = matches.find((item) => item.ride_id === activeRideId);
    vehicleRef.current = L.marker(path[0], { icon: createVehicle(match?.vehicle_type ?? 'Sedan') }).addTo(mapRef.current);
    let segment = 0;
    let progress = 0;
    let frameId = 0;
    const animate = () => {
      if (!vehicleRef.current || segment >= path.length - 1) return;
      const [startLat, startLon] = path[segment];
      const [endLat, endLon] = path[segment + 1];
      vehicleRef.current.setLatLng([startLat + (endLat - startLat) * progress, startLon + (endLon - startLon) * progress]);
      progress += 0.018;
      if (progress >= 1) {
        progress = 0;
        segment += 1;
      }
      frameId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(frameId);
  }, [activeRoute, activeRideId, matches]);

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1018]">
      <div ref={containerRef} className="absolute inset-0" aria-label="Interactive route map" />
      <div className="pointer-events-none absolute left-5 top-5 z-[1000] rounded-full border border-white/10 bg-[#080b11]/85 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300 backdrop-blur-xl">
        <span className={`mr-2 inline-block h-2 w-2 rounded-full ${clickMode === 'origin' ? 'bg-sky-300' : 'bg-rose-400'} shadow-[0_0_12px_currentColor]`} />
        {clickMode === 'origin' ? 'Click to set pickup' : 'Click to set destination'}
      </div>
      <div className="pointer-events-none absolute bottom-5 left-5 z-[1000] flex items-center gap-4 rounded-2xl border border-white/10 bg-[#080b11]/85 px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-slate-400 backdrop-blur-xl">
        <span><i className="legend-dot bg-sky-300" />Pickup</span>
        <span><i className="legend-dot bg-rose-400" />Dropoff</span>
        <span><i className="legend-dot bg-lime-300" />Live fleet</span>
      </div>
    </div>
  );
}
