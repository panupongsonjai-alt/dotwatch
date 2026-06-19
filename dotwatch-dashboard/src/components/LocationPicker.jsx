import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = {
  latitude: 13.5991,
  longitude: 100.5998,
};

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function MapUpdater({ position }) {
  const map = useMap();

  useEffect(() => {
    if (!position) return;
    map.setView([position.latitude, position.longitude], 16);
  }, [map, position]);

  return null;
}

function LocationMarker({ position, onChange }) {
  useMapEvents({
    click(event) {
      onChange({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
  });

  if (!position) return null;

  return (
    <Marker
      position={[position.latitude, position.longitude]}
      icon={markerIcon}
    />
  );
}

function LocationPicker({ latitude, longitude, onChange }) {
  const [position, setPosition] = useState(
    latitude != null && longitude != null
      ? {
          latitude: Number(latitude),
          longitude: Number(longitude),
        }
      : DEFAULT_CENTER,
  );

  const [keyword, setKeyword] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const searchTimerRef = useRef(null);

  function handleSelect(nextPosition) {
    setPosition(nextPosition);
    setMessage("");
    onChange?.(nextPosition);
  }

  function selectSuggestion(place) {
    const nextPosition = {
      latitude: Number(place.lat),
      longitude: Number(place.lon),
    };

    setKeyword(place.display_name);
    setSuggestions([]);
    handleSelect(nextPosition);
  }

  async function searchPlaces(query) {
    const text = query.trim();

    if (text.length < 3) {
      setSuggestions([]);
      return;
    }

    const coordinateMatch = text.match(
      /(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    );

    if (coordinateMatch) {
      setSuggestions([
        {
          place_id: "coordinate",
          display_name: `ใช้พิกัด ${coordinateMatch[1]}, ${coordinateMatch[2]}`,
          lat: coordinateMatch[1],
          lon: coordinateMatch[2],
        },
      ]);
      return;
    }

    try {
      setSearching(true);
      setMessage("");

      const params = new URLSearchParams({
        q: text,
        format: "json",
        limit: "5",
        addressdetails: "1",
      });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      );

      const data = await response.json();

      setSuggestions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setMessage("ค้นหาตำแหน่งไม่สำเร็จ");
    } finally {
      setSearching(false);
    }
  }

  function handleKeywordChange(value) {
    setKeyword(value);

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = setTimeout(() => {
      searchPlaces(value);
    }, 500);
  }

  return (
    <div className="location-picker">
      <div className="location-autocomplete">
        <div className="location-search-row">
          <input
            value={keyword}
            onChange={(event) => handleKeywordChange(event.target.value)}
            placeholder="พิมพ์ชื่อสถานที่ เช่น ปากน้ำ สมุทรปราการ"
          />

          <button
            type="button"
            onClick={() => searchPlaces(keyword)}
            disabled={searching}
          >
            {searching ? "ค้นหา..." : "ค้นหา"}
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="location-suggestions">
            {suggestions.map((place) => (
              <button
                key={place.place_id}
                type="button"
                onClick={() => selectSuggestion(place)}
              >
                <strong>
                  {place.name || place.display_name?.split(",")[0]}
                </strong>
                <span>{place.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {message && <div className="location-message">{message}</div>}

      <MapContainer
        center={[position.latitude, position.longitude]}
        zoom={13}
        className="location-map"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapUpdater position={position} />

        <LocationMarker position={position} onChange={handleSelect} />
      </MapContainer>

      <div className="location-values">
        <span>Latitude: {position.latitude.toFixed(6)}</span>
        <span>Longitude: {position.longitude.toFixed(6)}</span>
      </div>
    </div>
  );
}

export default LocationPicker;
