import { IconHistory } from '@tabler/icons-react';
import { stopCatchupSession } from '../api.js';
import SessionCard from './SessionCard.jsx';

export default function CatchupConnectionCard({ session, connection, programme, onChanged }) {
  const profile = connection.m3u_profile || {};
  const source = session.source || null;
  const catchupSession = {
    ...session,
    channel_id: session.channel_uuid,
    channel_name: session.channel_name || 'Catch-up',
    state: 'active',
    stream_id: source?.id || 'catchup',
    uptime: connection.duration || 0,
    client_count: 1,
    clients: [{
      ...connection,
      client_id: connection.client_id || connection.session_id,
      ip_address: connection.ip_address || 'Unknown IP',
    }],
    m3u_profile_name: profile.profile_name || profile.account_name,
    avg_bitrate: connection.avg_bitrate_kbps
      ? `${connection.avg_bitrate_kbps >= 1000 ? (connection.avg_bitrate_kbps / 1000).toFixed(2) : connection.avg_bitrate_kbps.toFixed(0)} ${connection.avg_bitrate_kbps >= 1000 ? 'Mbps' : 'Kbps'}`
      : '-',
  };
  const stop = () => stopCatchupSession(connection.session_id || connection.client_id);

  return (
    <SessionCard
      session={catchupSession}
      programme={programme}
      timelineMode="catchup"
      sourceDisabled
      sourceOptions={[source || { id: 'catchup', name: 'Catch-up playback' }]}
      statusIcon={IconHistory}
      statusLabel="Catch-up"
      statusColor="cyan"
      onStop={stop}
      onDisconnect={stop}
      stopLabel="Stop Catch-up"
      stopMessage={`Stop catch-up playback for ${catchupSession.channel_name}?`}
      stopSuccessMessage="Catch-up session stopped"
      disconnectSuccessMessage="Catch-up session stopped"
      onChanged={onChanged}
    />
  );
}
