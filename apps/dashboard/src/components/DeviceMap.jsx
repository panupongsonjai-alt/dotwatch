import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'

const DEFAULT_CENTER = [13.7563, 100.5018]
const GROUP_DISTANCE_METERS = 5
const LABEL_COLLISION_DISTANCE_METERS = 250
const NEARBY_MARKER_DISTANCE_PX = 90
const LABEL_COLLISION_MARGIN_PX = 8
const LABEL_HEIGHT_PX = 30
const EARTH_RADIUS_METERS = 6371000
const STATUS_PRIORITY = {
  critical: 0,
  warning: 1,
  offline: 2,
  online: 3,
}
const TOOLTIP_DIRECTIONS = ['right', 'top', 'bottom', 'left']

function getStatus(device = {}) {
  return String(device.status || 'offline')
    .trim()
    .toLowerCase()
}

function getStatusColor(status) {
  if (status === 'online') return '#22c55e'
  if (status === 'warning') return '#f59e0b'
  if (status === 'critical') return '#ef4444'

  return '#64748b'
}

function getDeviceName(device = {}) {
  return device.name || device.device_code || 'Unnamed Device'
}

function isValidCoordinate(latitude, longitude) {
  return (
    latitude !== null &&
    latitude !== undefined &&
    longitude !== null &&
    longitude !== undefined &&
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude))
  )
}

function getFallbackPosition(index = 0) {
  const angle = index * 0.65
  const radius = 0.012 + index * 0.0015

  return [
    DEFAULT_CENTER[0] + Math.sin(angle) * radius,
    DEFAULT_CENTER[1] + Math.cos(angle) * radius,
  ]
}

function getDevicePosition(device, index) {
  if (isValidCoordinate(device.latitude, device.longitude)) {
    return [Number(device.latitude), Number(device.longitude)]
  }

  return getFallbackPosition(index)
}

function getDistanceMeters(leftPosition, rightPosition) {
  const toRadians = (value) => (value * Math.PI) / 180
  const [leftLatitude, leftLongitude] = leftPosition
  const [rightLatitude, rightLongitude] = rightPosition
  const latitudeDelta = toRadians(rightLatitude - leftLatitude)
  const longitudeDelta = toRadians(rightLongitude - leftLongitude)
  const leftLatitudeRadians = toRadians(leftLatitude)
  const rightLatitudeRadians = toRadians(rightLatitude)

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitudeRadians) *
      Math.cos(rightLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2

  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  )
}

function groupDevicesByDistance(items) {
  const parents = items.map((_, index) => index)

  const find = (index) => {
    if (parents[index] !== index) parents[index] = find(parents[index])
    return parents[index]
  }

  const union = (leftIndex, rightIndex) => {
    const leftRoot = find(leftIndex)
    const rightRoot = find(rightIndex)
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
  }

  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    if (!items[leftIndex].hasCoordinates) continue

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < items.length;
      rightIndex += 1
    ) {
      if (!items[rightIndex].hasCoordinates) continue

      if (
        getDistanceMeters(
          items[leftIndex].position,
          items[rightIndex].position
        ) <= GROUP_DISTANCE_METERS
      ) {
        union(leftIndex, rightIndex)
      }
    }
  }

  const groupedItems = new Map()
  items.forEach((item, index) => {
    const root = find(index)
    if (!groupedItems.has(root)) groupedItems.set(root, [])
    groupedItems.get(root).push(item)
  })

  return [...groupedItems.values()].map((group) => {
    const devices = group
      .map((item) => item.device)
      .sort((left, right) => {
        const statusDifference =
          (STATUS_PRIORITY[getStatus(left)] ?? 99) -
          (STATUS_PRIORITY[getStatus(right)] ?? 99)

        return (
          statusDifference ||
          getDeviceName(left).localeCompare(getDeviceName(right), 'th')
        )
      })

    const position = [
      group.reduce((sum, item) => sum + item.position[0], 0) / group.length,
      group.reduce((sum, item) => sum + item.position[1], 0) / group.length,
    ]

    return {
      devices,
      position,
      key: devices
        .map(
          (device) => device.id || device.device_code || getDeviceName(device)
        )
        .join('-'),
    }
  })
}

function addTooltipLayouts(groups) {
  const parents = groups.map((_, index) => index)

  const find = (index) => {
    if (parents[index] !== index) parents[index] = find(parents[index])
    return parents[index]
  }

  const union = (leftIndex, rightIndex) => {
    const leftRoot = find(leftIndex)
    const rightRoot = find(rightIndex)
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
  }

  for (let leftIndex = 0; leftIndex < groups.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < groups.length;
      rightIndex += 1
    ) {
      if (
        getDistanceMeters(
          groups[leftIndex].position,
          groups[rightIndex].position
        ) <= LABEL_COLLISION_DISTANCE_METERS
      ) {
        union(leftIndex, rightIndex)
      }
    }
  }

  const collisionGroups = new Map()
  groups.forEach((group, index) => {
    const root = find(index)
    if (!collisionGroups.has(root)) collisionGroups.set(root, [])
    collisionGroups.get(root).push({ group, index })
  })

  const layouts = new Map()
  collisionGroups.forEach((items) => {
    items
      .sort((left, right) => {
        return (
          left.group.position[0] - right.group.position[0] ||
          left.group.position[1] - right.group.position[1]
        )
      })
      .forEach(({ index }, layoutIndex) => {
        const direction =
          TOOLTIP_DIRECTIONS[layoutIndex % TOOLTIP_DIRECTIONS.length]
        const tier = Math.floor(layoutIndex / TOOLTIP_DIRECTIONS.length)
        const distance = 16 + tier * 34
        const offsets = {
          top: [18, -distance],
          bottom: [18, distance],
          left: [-distance, -28],
          right: [Math.max(8, distance - 8), -34],
        }

        layouts.set(index, { direction, offset: offsets[direction] })
      })
  })

  return groups.map((group, index) => ({
    ...group,
    tooltipLayout: layouts.get(index) || {
      direction: 'right',
      offset: [8, -34],
    },
  }))
}

function estimateDevicePillWidth(device) {
  const characterCount = Array.from(getDeviceName(device)).length
  return Math.min(190, Math.max(72, 38 + characterCount * 7))
}

function getProjectedLabelBounds(group, map) {
  const point = map.latLngToContainerPoint(group.position)
  const width =
    group.devices.reduce(
      (total, device) => total + estimateDevicePillWidth(device),
      0
    ) +
    Math.max(0, group.devices.length - 1) * 6

  return {
    point,
    left: point.x - width / 2,
    right: point.x + width / 2,
    top: point.y - 72,
    bottom: point.y - 72 + LABEL_HEIGHT_PX,
  }
}

function projectedLabelsOverlap(leftBounds, rightBounds) {
  return !(
    leftBounds.right + LABEL_COLLISION_MARGIN_PX < rightBounds.left ||
    rightBounds.right + LABEL_COLLISION_MARGIN_PX < leftBounds.left ||
    leftBounds.bottom + LABEL_COLLISION_MARGIN_PX < rightBounds.top ||
    rightBounds.bottom + LABEL_COLLISION_MARGIN_PX < leftBounds.top
  )
}

function mergeViewportGroups(groups, map) {
  if (groups.length < 2) return groups

  const parents = groups.map((_, index) => index)
  const bounds = groups.map((group) => getProjectedLabelBounds(group, map))

  const find = (index) => {
    if (parents[index] !== index) parents[index] = find(parents[index])
    return parents[index]
  }

  const union = (leftIndex, rightIndex) => {
    const leftRoot = find(leftIndex)
    const rightRoot = find(rightIndex)
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
  }

  for (let leftIndex = 0; leftIndex < groups.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < groups.length;
      rightIndex += 1
    ) {
      const leftBounds = bounds[leftIndex]
      const rightBounds = bounds[rightIndex]
      const pixelDistance = leftBounds.point.distanceTo(rightBounds.point)

      if (
        pixelDistance <= NEARBY_MARKER_DISTANCE_PX ||
        projectedLabelsOverlap(leftBounds, rightBounds)
      ) {
        union(leftIndex, rightIndex)
      }
    }
  }

  const mergedGroups = new Map()
  groups.forEach((group, index) => {
    const root = find(index)
    if (!mergedGroups.has(root)) mergedGroups.set(root, [])
    mergedGroups.get(root).push(group)
  })

  return [...mergedGroups.values()].map((members) => {
    if (members.length === 1) return members[0]

    const devices = members
      .flatMap((member) => member.devices)
      .sort((left, right) => {
        const statusDifference =
          (STATUS_PRIORITY[getStatus(left)] ?? 99) -
          (STATUS_PRIORITY[getStatus(right)] ?? 99)

        return (
          statusDifference ||
          getDeviceName(left).localeCompare(getDeviceName(right), 'th')
        )
      })
    const totalDevices = members.reduce(
      (total, member) => total + member.devices.length,
      0
    )
    const position = [
      members.reduce(
        (sum, member) => sum + member.position[0] * member.devices.length,
        0
      ) / totalDevices,
      members.reduce(
        (sum, member) => sum + member.position[1] * member.devices.length,
        0
      ) / totalDevices,
    ]

    return {
      devices,
      position,
      key: members.map((member) => member.key).join('-'),
    }
  })
}

function createDeviceIcon() {
  return L.divIcon({
    className: 'device-map-marker-shell',
    html: `
      <span class="device-map-location-pin">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 10c0 5.5-8 12-8 12S4 15.5 4 10a8 8 0 1 1 16 0Z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
      </span>
    `,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
  })
}

function MapAutoFit({ positions }) {
  const map = useMap()

  useEffect(() => {
    if (!positions.length) {
      map.setView(DEFAULT_CENTER, 11)
      return
    }

    if (positions.length === 1) {
      map.setView(positions[0], 14)
      return
    }

    const bounds = L.latLngBounds(positions)
    map.fitBounds(bounds, {
      padding: [42, 42],
      maxZoom: 15,
    })
  }, [map, positions])

  return null
}

function DeviceMarker({ group, onOpenDevice }) {
  const { devices: groupedDevices, key, position, tooltipLayout } = group
  const isGroup = groupedDevices.length > 1
  const firstDevice = groupedDevices[0]

  return (
    <Marker
      key={key}
      position={position}
      icon={createDeviceIcon()}
      eventHandlers={
        !isGroup && typeof onOpenDevice === 'function'
          ? {
              click: () => onOpenDevice(firstDevice.id),
            }
          : undefined
      }
    >
      <Tooltip
        permanent
        direction={tooltipLayout.direction}
        offset={tooltipLayout.offset}
        opacity={1}
        className="device-map-label"
        interactive={typeof onOpenDevice === 'function'}
      >
        <div className="device-map-label-content device-map-label-list">
          {groupedDevices.map((device) => {
            const deviceName = getDeviceName(device)
            const deviceStatus = getStatus(device)
            const statusColor = getStatusColor(deviceStatus)
            const rowKey = device.id || device.device_code || deviceName
            const content = (
              <>
                <span
                  className="device-map-label-status-dot"
                  style={{ backgroundColor: statusColor, color: statusColor }}
                  aria-label={deviceStatus}
                  title={deviceStatus}
                />
                <strong>{deviceName}</strong>
              </>
            )

            return typeof onOpenDevice === 'function' ? (
              <button
                key={rowKey}
                type="button"
                className="device-map-label-row"
                onClick={(event) => {
                  event.stopPropagation()
                  onOpenDevice(device.id)
                }}
              >
                {content}
              </button>
            ) : (
              <div
                key={rowKey}
                className="device-map-label-row device-map-label-row-static"
              >
                {content}
              </div>
            )
          })}
        </div>
      </Tooltip>
    </Marker>
  )
}

function ViewportDeviceMarkers({ groups, onOpenDevice }) {
  const map = useMap()
  const [viewportVersion, setViewportVersion] = useState(0)

  useEffect(() => {
    const refreshGroups = () => setViewportVersion((current) => current + 1)
    map.on('zoomend moveend resize', refreshGroups)

    return () => {
      map.off('zoomend moveend resize', refreshGroups)
    }
  }, [map])

  const displayGroups = useMemo(
    () => addTooltipLayouts(mergeViewportGroups(groups, map)),
    [groups, map, viewportVersion]
  )

  return displayGroups.map((group) => (
    <DeviceMarker key={group.key} group={group} onOpenDevice={onOpenDevice} />
  ))
}

function LeafletDeviceMap({ devices = [], onOpenDevice, fallbackReason = '' }) {
  const visibleDevices = useMemo(() => {
    return Array.isArray(devices) ? devices : []
  }, [devices])

  const devicesWithPositions = useMemo(() => {
    return visibleDevices.map((device, index) => ({
      device,
      position: getDevicePosition(device, index),
      hasCoordinates: isValidCoordinate(device.latitude, device.longitude),
    }))
  }, [visibleDevices])

  const deviceGroups = useMemo(
    () => groupDevicesByDistance(devicesWithPositions),
    [devicesWithPositions]
  )

  const positions = useMemo(
    () => deviceGroups.map((group) => group.position),
    [deviceGroups]
  )

  if (!visibleDevices.length) {
    return (
      <div className="device-map-empty">
        <strong>No devices on map</strong>
        <p>ยังไม่มี Device สำหรับแสดงบนแผนที่</p>
      </div>
    )
  }

  return (
    <div className="device-map-wrapper device-map-wrapper-leaflet">
      <MapContainer
        center={positions[0] || DEFAULT_CENTER}
        zoom={12}
        scrollWheelZoom={false}
        className="dashboard-map"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapAutoFit positions={positions} />

        <ViewportDeviceMarkers
          groups={deviceGroups}
          onOpenDevice={onOpenDevice}
        />
      </MapContainer>

      <div
        className="device-map-provider-badge is-fallback"
        title={fallbackReason || 'Google Maps is unavailable'}
      >
        OpenStreetMap fallback
      </div>
    </div>
  )
}

let googleMapsLoaderPromise

function getGoogleMapsOptions() {
  const apiKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim()
  const language = String(
    import.meta.env.VITE_GOOGLE_MAPS_LANGUAGE || 'th'
  ).trim()
  const region = String(import.meta.env.VITE_GOOGLE_MAPS_REGION || 'TH').trim()
  const requestedType = String(
    import.meta.env.VITE_GOOGLE_MAPS_DEFAULT_TYPE || 'hybrid'
  )
    .trim()
    .toLowerCase()
  const defaultType = ['roadmap', 'satellite', 'hybrid'].includes(requestedType)
    ? requestedType
    : 'hybrid'

  return { apiKey, language, region, defaultType }
}

function loadGoogleMapsApi({ apiKey, language, region }) {
  if (typeof window === 'undefined') {
    return Promise.reject(
      new Error('Google Maps requires a browser environment.')
    )
  }

  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google.maps)
  }

  if (!apiKey) {
    return Promise.reject(
      new Error('VITE_GOOGLE_MAPS_API_KEY is not configured.')
    )
  }

  if (googleMapsLoaderPromise) return googleMapsLoaderPromise

  googleMapsLoaderPromise = new Promise((resolve, reject) => {
    const scriptId = 'dotwatch-google-maps-script'
    const callbackName = '__dotwatchGoogleMapsReady'
    const existingScript = document.getElementById(scriptId)
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Google Maps loading timed out.'))
    }, 20000)

    const finish = () => {
      window.clearTimeout(timeoutId)
      if (window.google?.maps?.Map) {
        resolve(window.google.maps)
      } else {
        reject(new Error('Google Maps loaded without the Maps library.'))
      }
    }

    window[callbackName] = finish
    window.gm_authFailure = () => {
      window.dispatchEvent(new CustomEvent('dotwatch:google-maps-auth-failure'))
      reject(new Error('Google Maps API authentication failed.'))
    }

    if (existingScript) {
      existingScript.addEventListener('load', finish, { once: true })
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Unable to load Google Maps JavaScript API.')),
        { once: true }
      )
      return
    }

    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      loading: 'async',
      callback: callbackName,
    })

    if (language) params.set('language', language)
    if (region) params.set('region', region)

    const script = document.createElement('script')
    script.id = scriptId
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.async = true
    script.defer = true
    script.onerror = () => {
      window.clearTimeout(timeoutId)
      reject(new Error('Unable to load Google Maps JavaScript API.'))
    }
    document.head.appendChild(script)
  }).catch((error) => {
    googleMapsLoaderPromise = undefined
    throw error
  })

  return googleMapsLoaderPromise
}

function createStatusDot(device) {
  const status = getStatus(device)
  const dot = document.createElement('span')
  dot.className = 'device-map-label-status-dot'
  dot.style.backgroundColor = getStatusColor(status)
  dot.style.color = getStatusColor(status)
  dot.setAttribute('aria-label', status)
  dot.title = status
  return dot
}

function createGoogleOverlayContent(group, onOpenDevice) {
  const root = document.createElement('div')
  root.className = 'google-device-overlay'

  const label = document.createElement('div')
  label.className =
    'google-device-label device-map-label-content device-map-label-list'

  group.devices.forEach((device) => {
    const canOpen =
      typeof onOpenDevice === 'function' && device.id !== undefined
    const row = document.createElement(canOpen ? 'button' : 'div')
    row.className = canOpen
      ? 'device-map-label-row google-device-label-row'
      : 'device-map-label-row device-map-label-row-static google-device-label-row'

    if (canOpen) {
      row.type = 'button'
      row.addEventListener('click', (event) => {
        event.stopPropagation()
        onOpenDevice(device.id)
      })
    }

    const name = document.createElement('strong')
    name.textContent = getDeviceName(device)
    row.append(createStatusDot(device), name)
    label.appendChild(row)
  })

  const pin = document.createElement('button')
  pin.type = 'button'
  pin.className = 'google-device-location-pin'
  pin.setAttribute('aria-label', `Open ${getDeviceName(group.devices[0])}`)
  pin.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 10c0 5.5-8 12-8 12S4 15.5 4 10a8 8 0 1 1 16 0Z"></path>
      <circle cx="12" cy="10" r="3"></circle>
    </svg>
  `

  if (
    typeof onOpenDevice === 'function' &&
    group.devices.length === 1 &&
    group.devices[0].id !== undefined
  ) {
    pin.addEventListener('click', (event) => {
      event.stopPropagation()
      onOpenDevice(group.devices[0].id)
    })
  } else {
    pin.tabIndex = -1
    pin.setAttribute('aria-hidden', 'true')
  }

  root.append(label, pin)
  return root
}

function createGoogleDeviceOverlay(maps, map, group, onOpenDevice) {
  class DeviceOverlay extends maps.OverlayView {
    constructor() {
      super()
      this.position = new maps.LatLng(group.position[0], group.position[1])
      this.root = createGoogleOverlayContent(group, onOpenDevice)
    }

    onAdd() {
      this.getPanes()?.overlayMouseTarget.appendChild(this.root)
    }

    draw() {
      const point = this.getProjection()?.fromLatLngToDivPixel(this.position)
      if (!point) return

      this.root.style.left = `${point.x}px`
      this.root.style.top = `${point.y}px`
      this.root.style.zIndex = String(
        Math.round(100000 - group.position[0] * 100)
      )
    }

    onRemove() {
      this.root.remove()
    }
  }

  const overlay = new DeviceOverlay()
  overlay.setMap(map)
  return overlay
}

function fitGoogleMapToPositions(maps, map, positions) {
  if (!positions.length) {
    map.setCenter({ lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] })
    map.setZoom(11)
    return
  }

  if (positions.length === 1) {
    map.setCenter({ lat: positions[0][0], lng: positions[0][1] })
    map.setZoom(14)
    return
  }

  const bounds = new maps.LatLngBounds()
  positions.forEach(([latitude, longitude]) => {
    bounds.extend({ lat: latitude, lng: longitude })
  })
  map.fitBounds(bounds, 52)

  maps.event.addListenerOnce(map, 'idle', () => {
    if ((map.getZoom() || 0) > 15) map.setZoom(15)
  })
}

function formatGoogleMapType(mapType) {
  if (mapType === 'satellite') return 'Satellite'
  if (mapType === 'roadmap') return 'Roadmap'
  return 'Hybrid'
}

function GoogleDeviceMap({
  devices = [],
  onOpenDevice,
  googleMapsOptions,
  onUnavailable,
}) {
  const mapElementRef = useRef(null)
  const mapRef = useRef(null)
  const overlaysRef = useRef([])
  const lastFitSignatureRef = useRef('')
  const [mapType, setMapType] = useState(googleMapsOptions.defaultType)
  const [mapReadyVersion, setMapReadyVersion] = useState(0)

  const visibleDevices = useMemo(
    () => (Array.isArray(devices) ? devices : []),
    [devices]
  )

  const devicesWithPositions = useMemo(() => {
    return visibleDevices.map((device, index) => ({
      device,
      position: getDevicePosition(device, index),
      hasCoordinates: isValidCoordinate(device.latitude, device.longitude),
    }))
  }, [visibleDevices])

  const deviceGroups = useMemo(
    () => groupDevicesByDistance(devicesWithPositions),
    [devicesWithPositions]
  )

  const positions = useMemo(
    () => deviceGroups.map((group) => group.position),
    [deviceGroups]
  )

  useEffect(() => {
    let disposed = false
    let mapTypeListener

    const handleAuthFailure = () => {
      if (!disposed) onUnavailable('Google Maps API authentication failed.')
    }

    window.addEventListener(
      'dotwatch:google-maps-auth-failure',
      handleAuthFailure
    )

    loadGoogleMapsApi(googleMapsOptions)
      .then((maps) => {
        if (disposed || !mapElementRef.current) return

        const map = new maps.Map(mapElementRef.current, {
          center: { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] },
          zoom: 11,
          mapTypeId: googleMapsOptions.defaultType,
          mapTypeControl: true,
          mapTypeControlOptions: {
            mapTypeIds: [
              maps.MapTypeId.ROADMAP,
              maps.MapTypeId.HYBRID,
              maps.MapTypeId.SATELLITE,
            ],
            style: maps.MapTypeControlStyle.HORIZONTAL_BAR,
            position: maps.ControlPosition.TOP_RIGHT,
          },
          zoomControl: true,
          fullscreenControl: true,
          streetViewControl: false,
          scaleControl: true,
          rotateControl: false,
          gestureHandling: 'cooperative',
          clickableIcons: false,
          keyboardShortcuts: true,
        })

        mapRef.current = map
        setMapType(map.getMapTypeId() || googleMapsOptions.defaultType)
        mapTypeListener = map.addListener('maptypeid_changed', () => {
          setMapType(map.getMapTypeId() || googleMapsOptions.defaultType)
        })
        setMapReadyVersion((current) => current + 1)
      })
      .catch((error) => {
        if (!disposed) onUnavailable(error.message)
      })

    return () => {
      disposed = true
      window.removeEventListener(
        'dotwatch:google-maps-auth-failure',
        handleAuthFailure
      )
      mapTypeListener?.remove()
      overlaysRef.current.forEach((overlay) => overlay.setMap(null))
      overlaysRef.current = []
      mapRef.current = null
      lastFitSignatureRef.current = ''
    }
  }, [googleMapsOptions, onUnavailable])

  useEffect(() => {
    const map = mapRef.current
    const maps = window.google?.maps
    if (!map || !maps) return undefined

    overlaysRef.current.forEach((overlay) => overlay.setMap(null))
    overlaysRef.current = deviceGroups.map((group) =>
      createGoogleDeviceOverlay(maps, map, group, onOpenDevice)
    )
    const fitSignature = positions
      .map(
        ([latitude, longitude]) =>
          `${latitude.toFixed(6)},${longitude.toFixed(6)}`
      )
      .join('|')

    if (lastFitSignatureRef.current !== fitSignature) {
      fitGoogleMapToPositions(maps, map, positions)
      lastFitSignatureRef.current = fitSignature
    }

    return () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null))
      overlaysRef.current = []
    }
  }, [deviceGroups, mapReadyVersion, onOpenDevice, positions])

  if (!visibleDevices.length) {
    return (
      <div className="device-map-empty">
        <strong>No devices on map</strong>
        <p>ยังไม่มี Device สำหรับแสดงบนแผนที่</p>
      </div>
    )
  }

  return (
    <div className="device-map-wrapper device-map-wrapper-google">
      <div ref={mapElementRef} className="dashboard-map google-device-map" />
      <div className="device-map-provider-badge">
        Google Maps · {formatGoogleMapType(mapType)}
      </div>
    </div>
  )
}

function DeviceMap({ devices = [], onOpenDevice }) {
  const googleMapsOptions = useMemo(() => getGoogleMapsOptions(), [])
  const [googleMapsError, setGoogleMapsError] = useState(
    googleMapsOptions.apiKey
      ? ''
      : 'VITE_GOOGLE_MAPS_API_KEY is not configured.'
  )

  const handleGoogleMapsUnavailable = useCallback((message) => {
    setGoogleMapsError(message || 'Google Maps is unavailable.')
  }, [])

  const visibleDevices = Array.isArray(devices) ? devices : []

  if (!visibleDevices.length) {
    return (
      <div className="device-map-empty">
        <strong>No devices on map</strong>
        <p>ยังไม่มี Device สำหรับแสดงบนแผนที่</p>
      </div>
    )
  }

  if (googleMapsError) {
    return (
      <LeafletDeviceMap
        devices={visibleDevices}
        onOpenDevice={onOpenDevice}
        fallbackReason={googleMapsError}
      />
    )
  }

  return (
    <GoogleDeviceMap
      devices={visibleDevices}
      onOpenDevice={onOpenDevice}
      googleMapsOptions={googleMapsOptions}
      onUnavailable={handleGoogleMapsUnavailable}
    />
  )
}

export default DeviceMap
