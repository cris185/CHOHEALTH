'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Same CDN workaround as DeliveryMap.tsx — Leaflet's default marker icon
// paths resolve relative to the page URL, which breaks under Next's bundler.
const pinIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function Recenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], zoom, map]);
  return null;
}

// Right-click (not left-click) places the pin, so left-click-drag stays free
// for panning around the map without any risk of nudging the destination.
function RightClickToPlace({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    contextmenu(e) {
      e.originalEvent.preventDefault();
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function AddressPickerMap({
  center, marker, onMarkerMove,
}: {
  center: [number, number];
  marker: [number, number] | null;
  onMarkerMove: (lat: number, lng: number) => void;
}) {
  return (
    <MapContainer
      center={center}
      zoom={marker ? 16 : 12}
      scrollWheelZoom
      style={{ height: '220px', width: '100%', zIndex: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {marker && (
        <Marker
          position={marker}
          icon={pinIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const pos = e.target.getLatLng();
              onMarkerMove(pos.lat, pos.lng);
            },
          }}
        />
      )}
      <RightClickToPlace onMove={onMarkerMove} />
      <Recenter center={center} zoom={marker ? 16 : 12} />
    </MapContainer>
  );
}
