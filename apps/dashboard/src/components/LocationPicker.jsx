import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import { Crosshair, LoaderCircle } from 'lucide-react'
import L from 'leaflet'
import { showUiToast } from '../utils/uiFeedback'

const DEFAULT_CENTER = {
  latitude: 13.5991,
  longitude: 100.5998,
}

const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 60000,
}

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

function MapUpdater({ position }) {
  const map = useMap()

  useEffect(() => {
    if (!position) return
    map.setView([position.latitude, position.longitude], 16)
  }, [map, position])

  return null
}

function LocationMarker({ position, onChange }) {
  useMapEvents({
    click(event) {
      onChange({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      })
    },
  })

  if (!position) return null

  return (
    <Marker
      position={[position.latitude, position.longitude]}
      icon={markerIcon}
    />
  )
}

function getGeolocationErrorMessage(error) {
  if (error?.code === 1) {
    return 'ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง กรุณาอนุญาต Location ใน Browser หรือเลือกตำแหน่งบนแผนที่'
  }

  if (error?.code === 2) {
    return 'ไม่พบตำแหน่งปัจจุบันของเครื่อง กรุณาลองใหม่หรือเลือกตำแหน่งบนแผนที่'
  }

  if (error?.code === 3) {
    return 'ค้นหาตำแหน่งใช้เวลานานเกินไป กรุณาลองใหม่หรือเลือกตำแหน่งบนแผนที่'
  }

  return 'ไม่สามารถอ่านตำแหน่งปัจจุบันของเครื่องได้'
}

function LocationPicker({ latitude, longitude, onChange }) {
  const hasInitialLocation = latitude != null && longitude != null
  const [position, setPosition] = useState(
    hasInitialLocation
      ? {
          latitude: Number(latitude),
          longitude: Number(longitude),
        }
      : DEFAULT_CENTER
  )

  const [keyword, setKeyword] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const searchTimerRef = useRef(null)
  const autoLocateRequestedRef = useRef(false)
  const geolocationRequestRef = useRef(0)

  const updateMessage = useCallback((nextMessage, { popup = true } = {}) => {
    setMessage(nextMessage)

    if (popup && nextMessage?.text) {
      showUiToast({
        type: nextMessage.type || 'info',
        title:
          nextMessage.type === 'success'
            ? 'Location updated'
            : nextMessage.type === 'error'
              ? 'Location unavailable'
              : 'Location information',
        message: nextMessage.text,
      })
    }
  }, [])

  const handleSelect = useCallback(
    (nextPosition, source = 'manual') => {
      if (source !== 'geolocation') {
        geolocationRequestRef.current += 1
        setLocating(false)
      }

      setPosition(nextPosition)
      updateMessage({ type: '', text: '' }, { popup: false })
      onChange?.(nextPosition)
    },
    [onChange, updateMessage]
  )

  const requestCurrentLocation = useCallback(
    ({ automatic = false } = {}) => {
      if (!navigator.geolocation) {
        updateMessage({
          type: 'error',
          text: 'Browser นี้ไม่รองรับการอ่านตำแหน่งปัจจุบัน กรุณาเลือกตำแหน่งบนแผนที่',
        })
        return
      }

      const requestId = geolocationRequestRef.current + 1
      geolocationRequestRef.current = requestId
      setLocating(true)

      navigator.geolocation.getCurrentPosition(
        (result) => {
          if (requestId !== geolocationRequestRef.current) return

          const nextPosition = {
            latitude: result.coords.latitude,
            longitude: result.coords.longitude,
          }

          handleSelect(nextPosition, 'geolocation')
          setKeyword('ตำแหน่งปัจจุบันของเครื่องนี้')

          const accuracy = Number(result.coords.accuracy)
          updateMessage({
            type: 'success',
            text: Number.isFinite(accuracy)
              ? `ใช้ตำแหน่งปัจจุบันแล้ว ความแม่นยำประมาณ ${Math.round(accuracy)} เมตร`
              : 'ใช้ตำแหน่งปัจจุบันของเครื่องนี้แล้ว',
          })
          setLocating(false)
        },
        (error) => {
          if (requestId !== geolocationRequestRef.current) return

          setLocating(false)
          updateMessage({
            type: automatic ? 'info' : 'error',
            text: getGeolocationErrorMessage(error),
          })
        },
        GEOLOCATION_OPTIONS
      )
    },
    [handleSelect, updateMessage]
  )

  useEffect(() => {
    if (latitude != null && longitude != null) {
      setPosition({
        latitude: Number(latitude),
        longitude: Number(longitude),
      })
      return
    }

    if (autoLocateRequestedRef.current) return

    autoLocateRequestedRef.current = true
    requestCurrentLocation({ automatic: true })
  }, [latitude, longitude, requestCurrentLocation])

  useEffect(
    () => () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current)
      }

      geolocationRequestRef.current += 1
    },
    []
  )

  function selectSuggestion(place) {
    const nextPosition = {
      latitude: Number(place.lat),
      longitude: Number(place.lon),
    }

    setKeyword(place.display_name)
    setSuggestions([])
    handleSelect(nextPosition)
  }

  async function searchPlaces(query) {
    const text = query.trim()

    if (text.length < 3) {
      setSuggestions([])
      return
    }

    const coordinateMatch = text.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)

    if (coordinateMatch) {
      setSuggestions([
        {
          place_id: 'coordinate',
          display_name: `ใช้พิกัด ${coordinateMatch[1]}, ${coordinateMatch[2]}`,
          lat: coordinateMatch[1],
          lon: coordinateMatch[2],
        },
      ])
      return
    }

    try {
      setSearching(true)
      updateMessage({ type: '', text: '' }, { popup: false })

      const params = new URLSearchParams({
        q: text,
        format: 'json',
        limit: '5',
        addressdetails: '1',
      })

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`
      )

      if (!response.ok) {
        throw new Error(`Location search failed with status ${response.status}`)
      }

      const data = await response.json()
      setSuggestions(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error(error)
      updateMessage({ type: 'error', text: 'ค้นหาตำแหน่งไม่สำเร็จ' })
    } finally {
      setSearching(false)
    }
  }

  function handleKeywordChange(value) {
    setKeyword(value)

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }

    searchTimerRef.current = setTimeout(() => {
      searchPlaces(value)
    }, 500)
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
            {searching ? 'ค้นหา...' : 'ค้นหา'}
          </button>
        </div>

        <div className="location-current-row">
          <button
            type="button"
            className="location-current-button"
            onClick={() => requestCurrentLocation()}
            disabled={locating}
          >
            {locating ? (
              <LoaderCircle className="location-current-spinner" size={16} />
            ) : (
              <Crosshair size={16} />
            )}
            {locating
              ? 'กำลังค้นหาตำแหน่ง...'
              : 'ใช้ตำแหน่งปัจจุบันของเครื่องนี้'}
          </button>
          <small>Browser อาจขออนุญาตเข้าถึง Location</small>
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
                  {place.name || place.display_name?.split(',')[0]}
                </strong>
                <span>{place.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {message.text && (
        <div className={`location-message ${message.type}`}>{message.text}</div>
      )}

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
  )
}

export default LocationPicker
