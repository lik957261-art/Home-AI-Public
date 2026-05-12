"""Weather lookup plugin for Hermes Mobile Gateway profiles."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any


WEATHER_SCHEMA = {
    "name": "weather",
    "description": (
        "Look up current and forecast weather for a user-facing location. "
        "Use this for weather-dependent planning such as clothing, travel, "
        "rain, wind, temperature, and outdoor activity decisions."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "location": {
                "type": "string",
                "description": "City, district, address, or place name to look up.",
            },
            "forecast_days": {
                "type": "integer",
                "description": "Number of forecast days to return, from 1 to 7. Defaults to 3.",
                "minimum": 1,
                "maximum": 7,
                "default": 3,
            },
        },
        "required": ["location"],
    },
}


WEATHER_CODE_SUMMARY = {
    0: "clear",
    1: "mostly_clear",
    2: "partly_cloudy",
    3: "overcast",
    45: "fog",
    48: "rime_fog",
    51: "light_drizzle",
    53: "drizzle",
    55: "dense_drizzle",
    56: "freezing_drizzle",
    57: "freezing_drizzle",
    61: "light_rain",
    63: "rain",
    65: "heavy_rain",
    66: "freezing_rain",
    67: "freezing_rain",
    71: "light_snow",
    73: "snow",
    75: "heavy_snow",
    77: "snow_grains",
    80: "light_showers",
    81: "showers",
    82: "heavy_showers",
    85: "snow_showers",
    86: "heavy_snow_showers",
    95: "thunderstorm",
    96: "thunderstorm_hail",
    99: "thunderstorm_hail",
}


def _fetch_json(url: str, timeout: int = 8) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": "HermesMobileWeather/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = response.read().decode("utf-8", errors="replace")
    return json.loads(payload)


def _clamp_days(value: Any) -> int:
    try:
        days = int(value)
    except Exception:
        days = 3
    return max(1, min(7, days))


def _summarize_code(value: Any) -> str:
    try:
        return WEATHER_CODE_SUMMARY.get(int(value), "unknown")
    except Exception:
        return "unknown"


def _daily_rows(daily: dict[str, Any]) -> list[dict[str, Any]]:
    dates = daily.get("time") or []
    rows: list[dict[str, Any]] = []
    for index, date_value in enumerate(dates):
        code = _item(daily.get("weather_code"), index)
        rows.append({
            "date": date_value,
            "condition": _summarize_code(code),
            "weather_code": code,
            "temp_max_c": _item(daily.get("temperature_2m_max"), index),
            "temp_min_c": _item(daily.get("temperature_2m_min"), index),
            "precipitation_probability_max_percent": _item(daily.get("precipitation_probability_max"), index),
            "precipitation_sum_mm": _item(daily.get("precipitation_sum"), index),
            "wind_speed_max_kmh": _item(daily.get("wind_speed_10m_max"), index),
        })
    return rows


def _item(values: Any, index: int) -> Any:
    if isinstance(values, list) and index < len(values):
        return values[index]
    return None


def _weather_handler(args: dict[str, Any], **_: Any) -> str:
    location = str(args.get("location") or "").strip()
    if not location:
        return json.dumps({"ok": False, "error": "location is required"}, ensure_ascii=False)

    forecast_days = _clamp_days(args.get("forecast_days", 3))
    geocode_url = (
        "https://geocoding-api.open-meteo.com/v1/search?"
        + urllib.parse.urlencode({
            "name": location,
            "count": 1,
            "language": "en",
            "format": "json",
        })
    )
    geocode = _fetch_json(geocode_url)
    results = geocode.get("results") or []
    if not results:
        return json.dumps({
            "ok": False,
            "error": "location_not_found",
            "location": location,
            "source": "open-meteo",
        }, ensure_ascii=False)

    place = results[0]
    latitude = place.get("latitude")
    longitude = place.get("longitude")
    forecast_url = (
        "https://api.open-meteo.com/v1/forecast?"
        + urllib.parse.urlencode({
            "latitude": latitude,
            "longitude": longitude,
            "current": ",".join([
                "temperature_2m",
                "relative_humidity_2m",
                "apparent_temperature",
                "precipitation",
                "rain",
                "showers",
                "snowfall",
                "weather_code",
                "cloud_cover",
                "wind_speed_10m",
                "wind_direction_10m",
            ]),
            "daily": ",".join([
                "weather_code",
                "temperature_2m_max",
                "temperature_2m_min",
                "precipitation_probability_max",
                "precipitation_sum",
                "wind_speed_10m_max",
            ]),
            "timezone": "auto",
            "forecast_days": forecast_days,
        })
    )
    forecast = _fetch_json(forecast_url)
    current = forecast.get("current") or {}
    code = current.get("weather_code")
    payload = {
        "ok": True,
        "source": "open-meteo",
        "query": location,
        "resolved_location": {
            "name": place.get("name"),
            "admin1": place.get("admin1"),
            "country": place.get("country"),
            "latitude": latitude,
            "longitude": longitude,
            "timezone": forecast.get("timezone"),
        },
        "current": {
            "time": current.get("time"),
            "condition": _summarize_code(code),
            "weather_code": code,
            "temperature_c": current.get("temperature_2m"),
            "apparent_temperature_c": current.get("apparent_temperature"),
            "relative_humidity_percent": current.get("relative_humidity_2m"),
            "precipitation_mm": current.get("precipitation"),
            "rain_mm": current.get("rain"),
            "showers_mm": current.get("showers"),
            "snowfall_cm": current.get("snowfall"),
            "cloud_cover_percent": current.get("cloud_cover"),
            "wind_speed_kmh": current.get("wind_speed_10m"),
            "wind_direction_degrees": current.get("wind_direction_10m"),
        },
        "daily": _daily_rows(forecast.get("daily") or {}),
    }
    return json.dumps(payload, ensure_ascii=False)


def register(ctx) -> None:
    ctx.register_tool(
        name="weather",
        toolset="weather",
        schema=WEATHER_SCHEMA,
        handler=_weather_handler,
        description="Current and forecast weather lookup for user-facing planning.",
        emoji="weather",
    )
