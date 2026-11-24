export function finiteNumber(value) {
  if (value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function duration(value) {
  const number = finiteNumber(value);
  return number != null && number >= 0 ? number : null;
}

export function audioTracks(stats) {
  return Array.isArray(stats?.audio_streams)
    ? stats.audio_streams.filter((track) => track && typeof track === 'object' && !Array.isArray(track))
    : [];
}

export function audioSummary(track) {
  return [track?.audio_language?.toString().toUpperCase(), track?.audio_channels, track?.audio_codec?.toString().toUpperCase()]
    .filter(Boolean).join(' ');
}

export function audioFields(track) {
  const fields = [];
  if (track.audio_language) fields.push(['Language', String(track.audio_language).toUpperCase()]);
  if (track.audio_channels) fields.push(['Channels', String(track.audio_channels)]);
  if (track.audio_codec) fields.push(['Codec', String(track.audio_codec).toUpperCase()]);
  if (track.audio_bitrate != null && track.audio_bitrate !== '') fields.push(['Bitrate', `${track.audio_bitrate} kbps`]);
  if (track.sample_rate != null && track.sample_rate !== '') fields.push(['Sample rate', `${track.sample_rate} Hz`]);
  if (typeof track.index === 'number' && Number.isFinite(track.index)) fields.push(['Stream', `0:${track.index}`]);
  else if (typeof track.pid === 'number' && Number.isFinite(track.pid)) fields.push(['Stream', `i:${track.pid}`]);
  return fields;
}
