// Weather + location services.
// Uses expo-location for foreground location + reverse geocoding to a city name.
// Weather API: OpenWeatherMap-compatible. The key is read from EXPO_PUBLIC_WEATHER_API_KEY
// (placeholder — swap provider later). Falls back to null gracefully so the brief still works.
import * as Location from "expo-location";

export type WeatherSnapshot = {
  tempC: number;
  condition: string;
};

export type LocationInfo = {
  city: string | null;
  latitude: number;
  longitude: number;
};

const WEATHER_BASE = "https://api.openweathermap.org/data/2.5";

function getWeatherKey(): string {
  return process.env.EXPO_PUBLIC_WEATHER_API_KEY ?? "";
}

export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

export async function getCurrentLocation(): Promise<LocationInfo | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") return null;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = pos.coords;

    let city: string | null = null;
    try {
      const reverse = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (reverse.length > 0) {
        city = reverse[0].city ?? reverse[0].region ?? reverse[0].country ?? null;
      }
    } catch {
      // ignore — city stays null
    }

    return { city, latitude, longitude };
  } catch {
    return null;
  }
}

async function fetchWeather(
  lat: number,
  lon: number,
  endpoint: "weather" | "forecast"
): Promise<WeatherSnapshot | null> {
  const key = getWeatherKey();
  if (!key) return null;
  try {
    const url = `${WEATHER_BASE}/${endpoint}?lat=${lat}&lon=${lon}&units=metric&appid=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (endpoint === "weather") {
      return {
        tempC: Math.round(data?.main?.temp ?? 0),
        condition: String(data?.weather?.[0]?.description ?? "clear"),
      };
    }
    // forecast — list of 3-hour entries; pick one ~12 hours ahead
    const list: Array<{ dt: number; main: { temp: number }; weather: Array<{ description: string }> }> =
      data?.list ?? [];
    if (list.length === 0) return null;
    const target = Date.now() / 1000 + 12 * 3600;
    const closest = list.reduce((a, b) =>
      Math.abs(b.dt - target) < Math.abs(a.dt - target) ? b : a
    );
    return {
      tempC: Math.round(closest.main.temp),
      condition: String(closest.weather[0]?.description ?? "clear"),
    };
  } catch {
    return null;
  }
}

export async function getCurrentWeather(loc: LocationInfo): Promise<WeatherSnapshot | null> {
  return fetchWeather(loc.latitude, loc.longitude, "weather");
}

export async function getEveningForecast(loc: LocationInfo): Promise<WeatherSnapshot | null> {
  return fetchWeather(loc.latitude, loc.longitude, "forecast");
}
