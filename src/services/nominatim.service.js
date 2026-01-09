/**
 * Nominatim Service for CrazyWalk Game
 * Handles geocoding and reverse geocoding via OpenStreetMap Nominatim API
 */

const axios = require('axios');
const config = require('../config');

const { baseUrl, userAgent, timeout } = config.apis.nominatim;

/**
 * Create axios instance for Nominatim
 */
const nominatimClient = axios.create({
  baseURL: baseUrl,
  headers: { 'User-Agent': userAgent },
  timeout
});

/**
 * Reverse geocode coordinates to address
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<Object>} Address data
 */
async function reverseGeocode(lat, lon) {
  const response = await nominatimClient.get('/reverse', {
    params: {
      format: 'json',
      lat,
      lon,
      zoom: 18,
      'accept-language': 'en'
    }
  });
  return response.data;
}

/**
 * Search for a place by query
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @returns {Promise<Array>} Search results
 */
async function searchPlace(query, limit = 1) {
  const response = await nominatimClient.get('/search', {
    params: {
      format: 'json',
      q: query,
      limit,
      'accept-language': 'en'
    }
  });
  return response.data;
}

/**
 * Get city name from coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<string>} City name
 */
async function getCityFromCoords(lat, lon) {
  try {
    const data = await reverseGeocode(lat, lon);
    const address = data.address || {};

    const city = address.city ||
      address.municipality ||
      address.town ||
      address.suburb ||
      address.village ||
      address.hamlet ||
      address.county ||
      address.state ||
      'Unknown City';

    return city;
  } catch (err) {
    console.warn(`Reverse geocoding failed: ${err.message}`);
    return 'Unknown City';
  }
}

/**
 * Get city center coordinates
 * @param {string} cityName - City name
 * @returns {Promise<Object|null>} { lat, lon } or null
 */
async function getCityCenter(cityName) {
  try {
    const results = await searchPlace(cityName, 1);
    if (results.length > 0) {
      return {
        lat: parseFloat(results[0].lat),
        lon: parseFloat(results[0].lon)
      };
    }
  } catch (err) {
    console.warn(`City search failed: ${err.message}`);
  }
  return null;
}

module.exports = {
  reverseGeocode,
  searchPlace,
  getCityFromCoords,
  getCityCenter
};
