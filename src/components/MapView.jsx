import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Circle, CircleMarker, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Teselas estandar de OpenStreetMap (sin clave de API). El tema oscuro se aplica
// con un filtro CSS sobre la misma tesela, evitando servicios de pago.
const TILES = {
  claro: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
  },
  oscuro: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
  }
};

function Fixer({ center, zoom, fitKey }) {
  const map = useMap();
  useEffect(() => {
    if (!Array.isArray(center) || !center.length) return;
    const latlngs = center
      .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map((p) => [p[0], p[1]]);
    if (!latlngs.length) return;
    try {
      if (latlngs.length === 1) {
        map.setView(latlngs[0], zoom || 13, { animate: true });
      } else {
        map.fitBounds(latlngs, { padding: [48, 48], maxZoom: 16 });
      }
    } catch (_) { /* ignora limites invalidos */ }
  }, [map, JSON.stringify(center), zoom, fitKey]);
  return null;
}

function Clicker({ onClick }) {
  useMapEvents({
    click(e) {
      onClick?.({ lat: e.latlng.lat, lon: e.latlng.lng });
    }
  });
  return null;
}

const iconOsc = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#1d4ed8;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const colorFor = (p) => {
  if (p >= 70) return '#15803d';
  if (p >= 45) return '#ca8a04';
  return '#b91c1c';
};

/**
 * Mapa de localizacion de clientes.
 * props: center {lat,lon} | clientes[] | radiusKm | selected | onSelectClient | onClickMap | dark
 */
export default function MapView({
  center = { lat: 38.4805, lon: -0.8033 },
  zoom = 13,
  radiusKm = 5,
  clientes = [],
  selected = [],
  onSelectClient,
  onClickMap,
  dark = false,
  fitKey = 0,
  height
}) {
  const selSet = new Set(selected.map((c) => c.id));
  const tile = dark ? TILES.oscuro : TILES.claro;
  const punto = center && Number.isFinite(Number(center.lat)) && Number.isFinite(Number(center.lon))
    ? [Number(center.lat), Number(center.lon)]
    : [38.4805, -0.8033];

  return (
    <div className="map-wrap" style={height ? { height } : undefined}>
      <div className="map">
        <MapContainer center={punto} zoom={zoom} style={{ height: '100%', width: '100%' }} zoomControl>
          <TileLayer url={tile.url} attribution={tile.attribution} />
          <Fixer center={punto} zoom={zoom} fitKey={fitKey} />
          {onClickMap && <Clicker onClick={onClickMap} />}

          {radiusKm > 0 && (
            <Circle
              center={punto}
              radius={radiusKm * 1000}
              pathOptions={{ color: '#1d4ed8', weight: 1.5, fillColor: '#1d4ed8', fillOpacity: 0.06, dashArray: '6 6' }}
            />
          )}

          {clientes.map((c) => (
            <CircleMarker
              key={c.id}
              center={[c.lat, c.lon]}
              radius={selSet.has(c.id) ? 11 : 7}
              pathOptions={{
                color: selSet.has(c.id) ? '#1d4ed8' : colorFor(c.probabilidad),
                weight: selSet.has(c.id) ? 3 : 1.5,
                fillColor: colorFor(c.probabilidad),
                fillOpacity: selSet.has(c.id) ? 0.95 : 0.65
              }}
              eventHandlers={{ click: () => onSelectClient?.(c) }}
            >
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <b>{c.nombre}</b><br />
                  <span style={{ fontSize: 12, color: '#64748b' }}>{c.categoria} · {c.distanciaKm} km</span><br />
                  <span style={{ fontSize: 12 }}>Probabilidad: <b>{c.probabilidad}%</b></span><br />
                  {c.contacto?.website && <a href={c.contacto.website} target="_blank" rel="noreferrer">Ver web</a>}
                </div>
              </Popup>
            </CircleMarker>
          ))}

          <Marker position={punto} icon={iconOsc}>
            <Popup>Centro de búsqueda</Popup>
          </Marker>
        </MapContainer>
      </div>
      <div className="map-legend">
        <b>Probabilidad:</b>{' '}
        <span style={{ color: '#15803d' }}>● alta</span>{' '}
        <span style={{ color: '#ca8a04' }}>● media</span>{' '}
        <span style={{ color: '#b91c1c' }}>● baja</span>
        <div className="tiny muted">Radio de análisis: {radiusKm} km · {clientes.length} negocios</div>
      </div>
    </div>
  );
}