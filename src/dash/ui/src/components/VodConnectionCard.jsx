import { IconDeviceTv, IconMovie } from '@tabler/icons-react';
import { stopVodClient, vodLogoUrl } from '../api.js';
import SessionCard from './SessionCard.jsx';
import { censorProvider } from '../utils/streamStats.js';

function formatBytes(bytes) {
  return `${((Number(bytes) || 0) / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VodConnectionCard({ content, connection, onChanged, preferences }) {
  const profile = connection.m3u_profile || {};
  const isEpisode = content.content_type === 'episode';
  const vodSession = {
    channel_id: content.content_uuid,
    channel_name: content.content_name || 'Unknown VOD',
    state: 'active',
    stream_id: 'vod',
    uptime: connection.duration || 0,
    client_count: 1,
    data_sent: formatBytes(connection.bytes_sent),
    m3u_profile_name: profile.profile_name || (preferences?.censor_provider ? censorProvider(profile.account_name) : profile.account_name),
    clients: [{
      ...connection,
      client_id: connection.client_id,
      ip_address: connection.client_ip || connection.ip_address || 'Unknown IP',
    }],
  };
  const stop = () => stopVodClient(connection.client_id);

  return (
    <SessionCard
      session={vodSession}
      preferences={preferences}
      sourceDisabled
      sourceOptions={[{ id: 'vod', name: 'VOD playback' }]}
      logoUrl={vodLogoUrl(content.content_type, content.content_uuid)}
      statusIcon={isEpisode ? IconDeviceTv : IconMovie}
      statusLabel={isEpisode ? 'Episode' : 'Movie'}
      statusColor="violet"
      onStop={stop}
      onDisconnect={stop}
      stopLabel="Stop VOD"
      stopMessage={`Stop playback for ${vodSession.channel_name}?`}
      stopSuccessMessage="VOD connection stopped"
      disconnectSuccessMessage="VOD connection stopped"
      onChanged={onChanged}
    />
  );
}
