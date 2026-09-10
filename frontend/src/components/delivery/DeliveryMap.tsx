'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet's default marker icon paths resolve relative to the page URL,
// which breaks under Next's bundler (no image assets get copied over) —
// pointing at the same CDN Leaflet itself publishes to is the standard
// workaround rather than wiring up asset imports for three tiny PNGs.
const courierIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Same marker image, tinted red via CSS filter — cheap way to get a visually
// distinct pin for the delivery address without hosting a second icon asset.
const destinationIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: 'delivery-map-destination-pin',
});

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng]);
  }, [lat, lng, map]);
  return null;
}

export default function DeliveryMap({
  lat, lng, label, destLat, destLng, destLabel,
}: {
  lat: number; lng: number; label?: string; destLat?: number | null; destLng?: number | null; destLabel?: string;
}) {
  const hasDest = destLat != null && destLng != null;
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={15}
      scrollWheelZoom={false}
      style={{ height: '280px', width: '100%', borderRadius: '0.75rem', zIndex: 0 }}
    >
      <style>{'.delivery-map-destination-pin { filter: hue-rotate(150deg) saturate(4); }'}</style>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[lat, lng]} icon={courierIcon}>
        {label && <Popup>{label}</Popup>}
      </Marker>
      {hasDest && (
        <Marker position={[destLat, destLng]} icon={destinationIcon}>
          {destLabel && <Popup>{destLabel}</Popup>}
        </Marker>
      )}
      <Recenter lat={lat} lng={lng} />
    </MapContainer>
  );
}
