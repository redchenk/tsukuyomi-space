<script setup>
defineProps({
  weather: { type: Object, required: true }
});
</script>

<template>
  <aside class="room-weather-card" aria-label="Room weather">
    <div class="room-weather-head">
      <span id="roomWeatherIcon" class="room-weather-icon" aria-hidden="true">{{ weather.icon }}</span>
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
