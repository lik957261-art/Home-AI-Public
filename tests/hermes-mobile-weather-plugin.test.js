"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const pluginPath = path.join(repoRoot, "gateway-plugins", "hermes-mobile-weather", "__init__.py");

function runPython(script) {
  return execFileSync(process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"), ["-c", script], {
    cwd: repoRoot,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    encoding: "utf8",
  }).trim();
}

function testMappedChineseLocationUsesWeatherCnWithoutChineseGeocoding() {
  const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("hermes_mobile_weather", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
def fail_fetch_json(*args, **kwargs):
    raise AssertionError("open_meteo_should_not_be_called")
module._fetch_json = fail_fetch_json
module._fetch_text = lambda *args, **kwargs: (
    'var cityDZ={"weatherinfo":{"city":"\\\\u5317\\\\u4eac","cityname":"beijing","weather":"\\\\u9634\\\\u8f6c\\\\u591a\\\\u4e91"}};'
    'var dataSK={"cityname":"\\\\u5317\\\\u4eac","city":"101010100","temp":"21.5","WD":"\\\\u897f\\\\u5357\\\\u98ce","WS":"2\\\\u7ea7","wse":"5km/h","SD":"68%","time":"20:45","rain":"0","aqi":"32","weather":"\\\\u591a\\\\u4e91","weathere":"Cloudy","weathercode":"d01","date":"05\\\\u670826\\\\u65e5"};'
    'var fc={"f":[{"fa":"02","fb":"01","fc":"24","fd":"18","fe":"\\\\u4e1c\\\\u5317\\\\u98ce","ff":"\\\\u897f\\\\u5357\\\\u98ce","fg":"<3\\\\u7ea7","fh":"<3\\\\u7ea7","fi":"5/26","fj":"\\\\u4eca\\\\u5929"}]};'
)
result = json.loads(module._weather_handler({"location": "\\u5317\\u4eac", "forecast_days": 1}))
print(json.dumps(result, ensure_ascii=False))
`;
  const result = JSON.parse(runPython(script));
  assert.equal(result.ok, true);
  assert.equal(result.source, "weather.cn");
  assert.equal(result.resolved_location.city_id, "101010100");
  assert.equal(result.current.condition, "Cloudy");
  assert.equal(result.current.temperature_c, 21.5);
  assert.equal(result.daily.length, 1);
  assert.equal(result.daily[0].condition, "overcast_to_cloudy");
}

function testWeatherCnFailureFallsBackToEnglishOpenMeteoQuery() {
  const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("hermes_mobile_weather", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
urls = []
module._fetch_text = lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("weather_cn_down"))
def fake_fetch_json(url, *args, **kwargs):
    urls.append(url)
    if "geocoding-api.open-meteo.com" in url:
        return {"results":[{"name":"Beijing","country":"China","latitude":39.9,"longitude":116.4}]}
    if "api.open-meteo.com" in url:
        return {
            "timezone":"Asia/Shanghai",
            "current":{"time":"2026-05-26T20:00","temperature_2m":22,"weather_code":2},
            "daily":{"time":["2026-05-26"],"weather_code":[2],"temperature_2m_max":[24],"temperature_2m_min":[18]}
        }
    raise AssertionError("unexpected_url:" + url)
module._fetch_json = fake_fetch_json
result = json.loads(module._weather_handler({"location": "\\u5317\\u4eac", "forecast_days": 1}))
print(json.dumps({"result": result, "urls": urls}, ensure_ascii=False))
`;
  const output = JSON.parse(runPython(script));
  assert.equal(output.result.ok, true);
  assert.equal(output.result.source, "open-meteo");
  assert.equal(output.result.query, "\u5317\u4eac");
  assert.equal(output.result.fallback_from, "weather.cn");
  assert.equal(output.result.provider_errors[0].source, "weather.cn");
  assert.match(output.urls[0], /Beijing/);
  assert.doesNotMatch(output.urls[0], /%E5|%e5|\\u5317/);
}

function testUnknownChineseLocationFailsWithoutChineseUpstreamLookup() {
  const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("hermes_mobile_weather", ${JSON.stringify(pluginPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module._fetch_text = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("weather_cn_should_not_be_called"))
module._fetch_json = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("open_meteo_should_not_be_called"))
result = json.loads(module._weather_handler({"location": "\\u672a\\u77e5\\u57ce\\u5e02"}))
print(json.dumps(result, ensure_ascii=False))
`;
  const result = JSON.parse(runPython(script));
  assert.equal(result.ok, false);
  assert.equal(result.error, "chinese_location_not_mapped");
  assert.equal(result.source, "local-china-location-map");
}

testMappedChineseLocationUsesWeatherCnWithoutChineseGeocoding();
testWeatherCnFailureFallsBackToEnglishOpenMeteoQuery();
testUnknownChineseLocationFailsWithoutChineseUpstreamLookup();

console.log("hermes-mobile-weather-plugin tests passed");
