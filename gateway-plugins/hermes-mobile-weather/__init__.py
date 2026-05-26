"""Weather lookup plugin for Hermes Mobile Gateway profiles."""

from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.error
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


WEATHER_CN_CODE_SUMMARY = {
    "00": "clear",
    "01": "cloudy",
    "02": "overcast",
    "03": "shower",
    "04": "thunder_shower",
    "05": "thunder_shower_hail",
    "06": "sleet",
    "07": "light_rain",
    "08": "moderate_rain",
    "09": "heavy_rain",
    "10": "rainstorm",
    "11": "heavy_rainstorm",
    "12": "severe_rainstorm",
    "13": "snow_shower",
    "14": "light_snow",
    "15": "moderate_snow",
    "16": "heavy_snow",
    "17": "snowstorm",
    "18": "fog",
    "19": "ice_rain",
    "20": "sandstorm",
    "21": "light_to_moderate_rain",
    "22": "moderate_to_heavy_rain",
    "23": "heavy_to_rainstorm",
    "24": "rainstorm_to_heavy_rainstorm",
    "25": "heavy_to_severe_rainstorm",
    "26": "light_to_moderate_snow",
    "27": "moderate_to_heavy_snow",
    "28": "heavy_to_snowstorm",
    "29": "dust",
    "30": "sand",
    "31": "strong_sandstorm",
    "53": "haze",
}


CHINA_LOCATIONS = [
    {"name": "Beijing", "city_id": "101010100", "aliases": ["\u5317\u4eac", "\u5317\u4eac\u5e02", "beijing", "beijing, china"]},
    {"name": "Shanghai", "city_id": "101020100", "aliases": ["\u4e0a\u6d77", "\u4e0a\u6d77\u5e02", "shanghai", "shanghai, china"]},
    {"name": "Tianjin", "city_id": "101030100", "aliases": ["\u5929\u6d25", "\u5929\u6d25\u5e02", "tianjin", "tianjin, china"]},
    {"name": "Chongqing", "city_id": "101040100", "aliases": ["\u91cd\u5e86", "\u91cd\u5e86\u5e02", "chongqing", "chongqing, china"]},
    {"name": "Harbin", "city_id": "101050101", "aliases": ["\u54c8\u5c14\u6ee8", "\u54c8\u5c14\u6ee8\u5e02", "harbin", "harbin, china"]},
    {"name": "Changchun", "city_id": "101060101", "aliases": ["\u957f\u6625", "\u957f\u6625\u5e02", "changchun", "changchun, china"]},
    {"name": "Shenyang", "city_id": "101070101", "aliases": ["\u6c88\u9633", "\u6c88\u9633\u5e02", "shenyang", "shenyang, china"]},
    {"name": "Dalian", "city_id": "101070201", "aliases": ["\u5927\u8fde", "\u5927\u8fde\u5e02", "dalian", "dalian, china"]},
    {"name": "Hohhot", "city_id": "101080101", "aliases": ["\u547c\u548c\u6d69\u7279", "\u547c\u548c\u6d69\u7279\u5e02", "hohhot", "hohhot, china"]},
    {"name": "Shijiazhuang", "city_id": "101090101", "aliases": ["\u77f3\u5bb6\u5e84", "\u77f3\u5bb6\u5e84\u5e02", "shijiazhuang", "shijiazhuang, china"]},
    {"name": "Taiyuan", "city_id": "101100101", "aliases": ["\u592a\u539f", "\u592a\u539f\u5e02", "taiyuan", "taiyuan, china"]},
    {"name": "Xian", "city_id": "101110101", "aliases": ["\u897f\u5b89", "\u897f\u5b89\u5e02", "xian", "xi'an", "xian, china", "xi'an, china"]},
    {"name": "Jinan", "city_id": "101120101", "aliases": ["\u6d4e\u5357", "\u6d4e\u5357\u5e02", "jinan", "jinan, china"]},
    {"name": "Qingdao", "city_id": "101120201", "aliases": ["\u9752\u5c9b", "\u9752\u5c9b\u5e02", "qingdao", "qingdao, china"]},
    {"name": "Urumqi", "city_id": "101130101", "aliases": ["\u4e4c\u9c81\u6728\u9f50", "\u4e4c\u9c81\u6728\u9f50\u5e02", "urumqi", "urumqi, china"]},
    {"name": "Lhasa", "city_id": "101140101", "aliases": ["\u62c9\u8428", "\u62c9\u8428\u5e02", "lhasa", "lhasa, china"]},
    {"name": "Xining", "city_id": "101150101", "aliases": ["\u897f\u5b81", "\u897f\u5b81\u5e02", "xining", "xining, china"]},
    {"name": "Lanzhou", "city_id": "101160101", "aliases": ["\u5170\u5dde", "\u5170\u5dde\u5e02", "lanzhou", "lanzhou, china"]},
    {"name": "Yinchuan", "city_id": "101170101", "aliases": ["\u94f6\u5ddd", "\u94f6\u5ddd\u5e02", "yinchuan", "yinchuan, china"]},
    {"name": "Zhengzhou", "city_id": "101180101", "aliases": ["\u90d1\u5dde", "\u90d1\u5dde\u5e02", "zhengzhou", "zhengzhou, china"]},
    {"name": "Nanjing", "city_id": "101190101", "aliases": ["\u5357\u4eac", "\u5357\u4eac\u5e02", "nanjing", "nanjing, china"]},
    {"name": "Wuxi", "city_id": "101190201", "aliases": ["\u65e0\u9521", "\u65e0\u9521\u5e02", "wuxi", "wuxi, china"]},
    {"name": "Suzhou", "city_id": "101190401", "aliases": ["\u82cf\u5dde", "\u82cf\u5dde\u5e02", "suzhou", "suzhou, china"]},
    {"name": "Wuhan", "city_id": "101200101", "aliases": ["\u6b66\u6c49", "\u6b66\u6c49\u5e02", "wuhan", "wuhan, china"]},
    {"name": "Hangzhou", "city_id": "101210101", "aliases": ["\u676d\u5dde", "\u676d\u5dde\u5e02", "hangzhou", "hangzhou, china"]},
    {"name": "Ningbo", "city_id": "101210401", "aliases": ["\u5b81\u6ce2", "\u5b81\u6ce2\u5e02", "ningbo", "ningbo, china"]},
    {"name": "Hefei", "city_id": "101220101", "aliases": ["\u5408\u80a5", "\u5408\u80a5\u5e02", "hefei", "hefei, china"]},
    {"name": "Fuzhou", "city_id": "101230101", "aliases": ["\u798f\u5dde", "\u798f\u5dde\u5e02", "fuzhou", "fuzhou, china"]},
    {"name": "Xiamen", "city_id": "101230201", "aliases": ["\u53a6\u95e8", "\u53a6\u95e8\u5e02", "xiamen", "xiamen, china"]},
    {"name": "Nanchang", "city_id": "101240101", "aliases": ["\u5357\u660c", "\u5357\u660c\u5e02", "nanchang", "nanchang, china"]},
    {"name": "Changsha", "city_id": "101250101", "aliases": ["\u957f\u6c99", "\u957f\u6c99\u5e02", "changsha", "changsha, china"]},
    {"name": "Guiyang", "city_id": "101260101", "aliases": ["\u8d35\u9633", "\u8d35\u9633\u5e02", "guiyang", "guiyang, china"]},
    {"name": "Chengdu", "city_id": "101270101", "aliases": ["\u6210\u90fd", "\u6210\u90fd\u5e02", "chengdu", "chengdu, china"]},
    {"name": "Guangzhou", "city_id": "101280101", "aliases": ["\u5e7f\u5dde", "\u5e7f\u5dde\u5e02", "guangzhou", "guangzhou, china"]},
    {"name": "Shenzhen", "city_id": "101280601", "aliases": ["\u6df1\u5733", "\u6df1\u5733\u5e02", "shenzhen", "shenzhen, china"]},
    {"name": "Zhuhai", "city_id": "101280701", "aliases": ["\u73e0\u6d77", "\u73e0\u6d77\u5e02", "zhuhai", "zhuhai, china"]},
    {"name": "Foshan", "city_id": "101280800", "aliases": ["\u4f5b\u5c71", "\u4f5b\u5c71\u5e02", "foshan", "foshan, china"]},
    {"name": "Dongguan", "city_id": "101281601", "aliases": ["\u4e1c\u839e", "\u4e1c\u839e\u5e02", "dongguan", "dongguan, china"]},
    {"name": "Kunming", "city_id": "101290101", "aliases": ["\u6606\u660e", "\u6606\u660e\u5e02", "kunming", "kunming, china"]},
    {"name": "Nanning", "city_id": "101300101", "aliases": ["\u5357\u5b81", "\u5357\u5b81\u5e02", "nanning", "nanning, china"]},
    {"name": "Haikou", "city_id": "101310101", "aliases": ["\u6d77\u53e3", "\u6d77\u53e3\u5e02", "haikou", "haikou, china"]},
    {"name": "Sanya", "city_id": "101310201", "aliases": ["\u4e09\u4e9a", "\u4e09\u4e9a\u5e02", "sanya", "sanya, china"]},
    {"name": "Hong Kong", "city_id": "101320101", "aliases": ["\u9999\u6e2f", "\u9999\u6e2f\u7279\u522b\u884c\u653f\u533a", "hong kong", "hong kong, china"]},
    {"name": "Macau", "city_id": "101330101", "aliases": ["\u6fb3\u95e8", "\u6fb3\u95e8\u7279\u522b\u884c\u653f\u533a", "macau", "macao", "macau, china", "macao, china"]},
    {"name": "Taipei", "city_id": "101340101", "aliases": ["\u53f0\u5317", "\u53f0\u5317\u5e02", "taipei", "taipei, china"]},
]


def _has_cjk(value: str) -> bool:
    return bool(re.search(r"[\u3400-\u9fff]", value or ""))


def _location_key(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text)
    if _has_cjk(text):
        text = re.sub(r"\s+", "", text)
        for suffix in ("\u5929\u6c14\u9884\u62a5", "\u5929\u6c14", "\u4e2d\u56fd", "\u5e02"):
            if text.endswith(suffix):
                text = text[: -len(suffix)]
    return text.lower()


def _build_china_lookup() -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for place in CHINA_LOCATIONS:
        normalized = dict(place)
        normalized["country"] = "China"
        normalized["open_meteo_query"] = f"{place['name']}, China"
        for alias in place.get("aliases", []):
            key = _location_key(alias)
            if key:
                lookup[key] = normalized
    return lookup


CHINA_LOCATION_LOOKUP = _build_china_lookup()


def _fetch_text(url: str, timeout: int = 8, headers: dict[str, str] | None = None) -> str:
    request_headers = {"User-Agent": "HermesMobileWeather/1.0"}
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(url, headers=request_headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = response.read().decode("utf-8", errors="replace")
    return payload


def _fetch_json(url: str, timeout: int = 8, headers: dict[str, str] | None = None) -> dict[str, Any]:
    return json.loads(_fetch_text(url, timeout=timeout, headers=headers))


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


def _resolve_china_location(location: str) -> dict[str, Any] | None:
    key = _location_key(location)
    if key in CHINA_LOCATION_LOOKUP:
        return CHINA_LOCATION_LOOKUP[key]
    if key.endswith(", china") and key[:-7].strip() in CHINA_LOCATION_LOOKUP:
        return CHINA_LOCATION_LOOKUP[key[:-7].strip()]
    return None


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text in {"--", "999", "9999"}:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except Exception:
        return None


def _safe_int(value: Any) -> int | None:
    number = _safe_float(value)
    if number is None:
        return None
    return int(number)


def _weather_cn_code_summary(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"^[dn]", "", text)
    text = text.zfill(2)
    return WEATHER_CN_CODE_SUMMARY.get(text, "unknown")


def _join_condition(day_condition: str, night_condition: str) -> str:
    if not day_condition or day_condition == "unknown":
        return night_condition or "unknown"
    if not night_condition or night_condition == "unknown" or day_condition == night_condition:
        return day_condition
    return f"{day_condition}_to_{night_condition}"


def _extract_weather_cn_var(text: str, name: str) -> dict[str, Any]:
    match = re.search(rf"\bvar\s+{re.escape(name)}\s*=", text)
    if not match:
        return {}
    decoder = json.JSONDecoder()
    payload, _ = decoder.raw_decode(text[match.end():].lstrip())
    if isinstance(payload, dict):
        return payload
    return {}


def _weather_cn_daily_rows(fc: dict[str, Any], forecast_days: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for entry in (fc.get("f") or [])[:forecast_days]:
        if not isinstance(entry, dict):
            continue
        day_code = entry.get("fa")
        night_code = entry.get("fb")
        day_condition = _weather_cn_code_summary(day_code)
        night_condition = _weather_cn_code_summary(night_code)
        rows.append({
            "date": entry.get("fi"),
            "label": entry.get("fj"),
            "condition": _join_condition(day_condition, night_condition),
            "weather_code": day_code,
            "day_weather_code": day_code,
            "night_weather_code": night_code,
            "day_condition": day_condition,
            "night_condition": night_condition,
            "temp_max_c": _safe_float(entry.get("fc")),
            "temp_min_c": _safe_float(entry.get("fd")),
            "precipitation_probability_max_percent": None,
            "precipitation_sum_mm": None,
            "wind_speed_max_kmh": None,
            "day_wind_direction": entry.get("fe"),
            "night_wind_direction": entry.get("ff"),
            "day_wind_scale": entry.get("fg"),
            "night_wind_scale": entry.get("fh"),
        })
    return rows


def _weather_cn_payload(location: str, place: dict[str, Any], forecast_days: int) -> dict[str, Any]:
    city_id = str(place.get("city_id") or "").strip()
    if not city_id:
        raise ValueError("weather_cn_city_id_missing")
    now_ms = int(time.time() * 1000)
    url = f"https://d1.weather.com.cn/weather_index/{urllib.parse.quote(city_id)}.html?_={now_ms}"
    text = _fetch_text(url, headers={
        "User-Agent": "Mozilla/5.0 HermesMobileWeather/1.0",
        "Referer": f"https://www.weather.com.cn/weather/{city_id}.shtml",
    })
    data_sk = _extract_weather_cn_var(text, "dataSK")
    city_dz = _extract_weather_cn_var(text, "cityDZ")
    fc = _extract_weather_cn_var(text, "fc")
    if not data_sk and not fc:
        raise ValueError("weather_cn_payload_unrecognized")

    city_info = (city_dz.get("weatherinfo") or {}) if isinstance(city_dz, dict) else {}
    current_code = data_sk.get("weathercode") or city_info.get("weathercode")
    condition = data_sk.get("weathere") or _weather_cn_code_summary(current_code)
    payload = {
        "ok": True,
        "source": "weather.cn",
        "query": location,
        "resolved_location": {
            "name": data_sk.get("cityname") or city_info.get("city") or place.get("name"),
            "country": "China",
            "city_id": city_id,
            "open_meteo_query": place.get("open_meteo_query"),
        },
        "current": {
            "time": " ".join(str(item) for item in (data_sk.get("date"), data_sk.get("time")) if item),
            "condition": condition,
            "condition_zh": data_sk.get("weather") or city_info.get("weather"),
            "weather_code": current_code,
            "temperature_c": _safe_float(data_sk.get("temp")),
            "apparent_temperature_c": None,
            "relative_humidity_percent": _safe_float(data_sk.get("SD") or data_sk.get("sd")),
            "precipitation_mm": _safe_float(data_sk.get("rain")),
            "rain_mm": _safe_float(data_sk.get("rain")),
            "showers_mm": None,
            "snowfall_cm": None,
            "cloud_cover_percent": None,
            "wind_speed_kmh": _safe_float(data_sk.get("wse")),
            "wind_direction_degrees": None,
            "wind_direction": data_sk.get("WD"),
            "wind_scale": data_sk.get("WS"),
            "air_quality_index": _safe_int(data_sk.get("aqi")),
        },
        "daily": _weather_cn_daily_rows(fc, forecast_days),
    }
    return payload


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


def _open_meteo_geocode(location: str) -> dict[str, Any]:
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
        raise LookupError("location_not_found")
    return results[0]


def _open_meteo_payload(location: str, forecast_days: int, place: dict[str, Any] | None = None) -> dict[str, Any]:
    if place is None:
        place = _open_meteo_geocode(location)
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
    return payload


def _error_summary(exc: BaseException) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        return f"http_{exc.code}"
    if isinstance(exc, urllib.error.URLError):
        return f"url_error:{getattr(exc, 'reason', exc)}"[:120]
    return str(exc)[:120] or exc.__class__.__name__


def _weather_handler(args: dict[str, Any], **_: Any) -> str:
    location = str(args.get("location") or "").strip()
    if not location:
        return json.dumps({"ok": False, "error": "location is required"}, ensure_ascii=False)

    forecast_days = _clamp_days(args.get("forecast_days", 3))
    provider_errors: list[dict[str, str]] = []
    china_place = _resolve_china_location(location)

    if china_place:
        try:
            return json.dumps(_weather_cn_payload(location, china_place, forecast_days), ensure_ascii=False)
        except Exception as exc:
            provider_errors.append({"source": "weather.cn", "error": _error_summary(exc)})
        try:
            payload = _open_meteo_payload(china_place.get("open_meteo_query") or china_place["name"], forecast_days)
            payload["query"] = location
            payload["fallback_from"] = "weather.cn"
            payload["provider_errors"] = provider_errors
            return json.dumps(payload, ensure_ascii=False)
        except Exception as exc:
            provider_errors.append({"source": "open-meteo", "error": _error_summary(exc)})
        return json.dumps({
            "ok": False,
            "error": "weather_providers_unavailable",
            "location": location,
            "source": "weather.cn",
            "provider_errors": provider_errors,
        }, ensure_ascii=False)

    if _has_cjk(location):
        return json.dumps({
            "ok": False,
            "error": "chinese_location_not_mapped",
            "location": location,
            "source": "local-china-location-map",
        }, ensure_ascii=False)

    try:
        return json.dumps(_open_meteo_payload(location, forecast_days), ensure_ascii=False)
    except LookupError:
        return json.dumps({
            "ok": False,
            "error": "location_not_found",
            "location": location,
            "source": "open-meteo",
        }, ensure_ascii=False)
    except Exception as exc:
        return json.dumps({
            "ok": False,
            "error": "weather_provider_error",
            "location": location,
            "source": "open-meteo",
            "provider_errors": [{"source": "open-meteo", "error": _error_summary(exc)}],
        }, ensure_ascii=False)


def register(ctx) -> None:
    ctx.register_tool(
        name="weather",
        toolset="weather",
        schema=WEATHER_SCHEMA,
        handler=_weather_handler,
        description="Current and forecast weather lookup for user-facing planning.",
        emoji="weather",
    )
