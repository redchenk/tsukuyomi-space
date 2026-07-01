<script setup>
import { computed } from 'vue';
import TsIcon from '../TsIcon.vue';

const props = defineProps({
  weather: { type: Object, required: true }
});

const weatherIconName = computed(() => {
  const source = `${props.weather?.label || ''} ${props.weather?.icon || ''}`.toLowerCase();
  if (/storm|thunder|lightning|雷|⛈|⚡/.test(source)) return 'cloudLightning';
  if (/rain|shower|drizzle|雨|🌧|🌦|☔/.test(source)) return 'cloudRain';
  if (/snow|sleet|雪|❄/.test(source)) return 'cloudSnow';
  if (/fog|mist|haze|雾|霾/.test(source)) return 'cloudFog';
  if (/cloud|overcast|阴|云|☁/.test(source)) return 'cloud';
  if (/sun|clear|晴|☀/.test(source)) return 'sun';
  return 'cloudSun';
});
</script>

<template>
  <aside class="room-weather-card" aria-label="Room weather">
    <div class="room-weather-head">
      <span id="roomWeatherIcon" class="room-weather-icon" aria-hidden="true">
        <TsIcon :name="weatherIconName" :size="22" />
      </span>
      <div>
        <small id="roomWeatherCity" :title="weather.city">{{ weather.city }}</small>
        <strong id="roomWeatherLabel">{{ weather.temperature }} {{ weather.label }}</strong>
      </div>
    </div>
    <div class="room-weather-meta">
      <span id="roomWeatherTemperature">{{ weather.temperature }}</span>
      <span id="roomWeatherWind">{{ weather.wind }}</span>
    </div>
    <p id="roomWeatherDetail">{{ weather.detail }}</p>
  </aside>
</template>
