import { useEffect, useState } from 'react';
import { Card, Group, Text, Badge, Select, Accordion, Stack, ActionIcon, Tooltip, Loader, Center, Image, ThemeIcon } from '@mantine/core';
import { IconUserOff, IconSquareX, IconVideo, IconCloudUpload, IconCheck, IconLoader2, IconPlayerPlay } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { ConfirmModal, resolveStatusColor } from '@swvn-dispatch/dispatch-ui-kit';
import { channelStreams, switchSource, disconnectClient, stopChannel, sessionDetail, channelLogoUrl } from '../api.js';
import ProgramTimeline from './ProgramTimeline.jsx';

function formatUptime(seconds) {
  if (seconds == null) return '-';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
}

const STATE_COLORS = {
  active: 'green',
  buffering: 'yellow',
  connecting: 'yellow',
  initializing: 'yellow',
  waiting_for_clients: 'blue',
  error: 'red',
  stopped: 'gray',
  stopping: 'gray',
};

// Matches Dispatcharr's own Stats page badge colors (StreamConnectionCard.jsx)
const SPEED_OK_THRESHOLD = 1.0;

export function StreamStatsBadges({
  stats,
  speed,
  size = 'sm',
  justify = 'center',
  style,
  ...groupProps
}) {
  if (!stats) return null;
  const hasAny =
    stats.resolution ||
    stats.source_fps ||
    stats.video_codec ||
    stats.audio_codec ||
    stats.audio_channels ||
    stats.stream_type ||
    speed != null;
  if (!hasAny) return null;
  const badgeCount = [
    stats.resolution,
    stats.source_fps,
    stats.video_codec,
    stats.audio_codec,
    stats.audio_channels,
    stats.stream_type,
    speed != null,
  ].filter(Boolean).length;

  return (
    <Group
      gap="xs"
      justify={justify}
      {...groupProps}
      style={{
        flexWrap: 'wrap',
        maxWidth: badgeCount > 3 ? 280 : undefined,
        justifyContent: justify,
        marginInline: justify === 'center' ? 'auto' : undefined,
        ...style,
      }}
    >
      {stats.resolution && (
        <Tooltip label="Video resolution">
          <Badge size={size} variant="light" color="red">
            {stats.resolution}
          </Badge>
        </Tooltip>
      )}
      {stats.source_fps && (
        <Tooltip label="Source frames per second">
          <Badge size={size} variant="light" color="orange">
            {Math.round(stats.source_fps)} FPS
          </Badge>
        </Tooltip>
      )}
      {stats.video_codec && (
        <Tooltip label="Video codec">
          <Badge size={size} variant="light" color="blue">
            {stats.video_codec.toUpperCase()}
          </Badge>
        </Tooltip>
      )}
      {stats.audio_codec && (
        <Tooltip label="Audio codec">
          <Badge size={size} variant="light" color="pink">
            {stats.audio_codec.toUpperCase()}
          </Badge>
        </Tooltip>
      )}
      {stats.audio_channels && (
        <Tooltip label="Audio channel configuration">
          <Badge size={size} variant="light" color="pink">
            {stats.audio_channels}
          </Badge>
        </Tooltip>
      )}
      {stats.stream_type && (
        <Tooltip label="Stream type">
          <Badge size={size} variant="light" color="cyan">
            {stats.stream_type.toUpperCase()}
          </Badge>
        </Tooltip>
      )}
      {speed != null && (
        <Tooltip label={`Current speed: ${speed.toFixed(2)}x`}>
          <Badge size={size} variant="light" color={speed >= SPEED_OK_THRESHOLD ? 'green' : 'red'}>
            {speed.toFixed(2)}x
          </Badge>
        </Tooltip>
      )}
    </Group>
  );
}

export function SessionStatsBlock({ session, speed, hideClientCount = false }) {
  return (
    <>
      <Stack gap={4} mb="sm">
        <Group gap="xs" justify="space-between">
          <Text size="sm" c="dimmed">
            Uptime
          </Text>
          <Text size="sm">{formatUptime(session.uptime)}</Text>
        </Group>
        <Group gap="xs" justify="space-between">
          <Text size="sm" c="dimmed">
            Bitrate
          </Text>
          <Text size="sm">{session.avg_bitrate || '-'}</Text>
        </Group>
        {!hideClientCount && (
          <Group gap="xs" justify="space-between">
            <Text size="sm" c="dimmed">
              Clients
            </Text>
            <Text size="sm">{session.client_count ?? 0}</Text>
          </Group>
        )}
        {session.data_sent && (
          <Group gap="xs" justify="space-between">
            <Text size="sm" c="dimmed">
              Data Sent
            </Text>
            <Text size="sm">{session.data_sent}</Text>
          </Group>
        )}
        {session.stream_profile_name && (
          <Group gap="xs" justify="space-between" wrap="nowrap">
            <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
              <IconVideo size={14} />
              <Text size="sm" c="dimmed">
                Stream Profile
              </Text>
            </Group>
            <Text size="sm" truncate style={{ minWidth: 0, flex: 1 }} ta="right">
              {session.stream_profile_name}
            </Text>
          </Group>
        )}
        {session.m3u_profile_name && (
          <Group gap="xs" justify="space-between" wrap="nowrap">
            <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
              <IconCloudUpload size={14} />
              <Text size="sm" c="dimmed">
                M3U Profile
              </Text>
            </Group>
            <Text size="sm" truncate style={{ minWidth: 0, flex: 1 }} ta="right">
              {session.m3u_profile_name}
            </Text>
          </Group>
        )}
      </Stack>

      <StreamStatsBadges stats={session} speed={speed} mb="sm" />
    </>
  );
}

export default function SessionCard({
  session,
  onChanged,
  programme,
  sourceDisabled = false,
  sourceOptions = null,
  onStop,
  stopLabel = 'Stop Stream',
  stopMessage,
  onDisconnect,
  stopSuccessMessage = 'Stream stopped',
  disconnectSuccessMessage = 'Client disconnected',
  hideClientCount = false,
  logoUrl,
  statusIcon: StatusIcon,
  statusLabel,
  statusColor,
  timelineMode = 'live',
}) {
  const [streams, setStreams] = useState(sourceOptions);
  const [currentStreamId, setCurrentStreamId] = useState(
    session.stream_id != null ? String(session.stream_id) : null,
  );
  const [switching, setSwitching] = useState(false);
  const [clients, setClients] = useState(session.clients || []);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    if (sourceDisabled) return undefined;
    let cancelled = false;
    channelStreams(session.channel_id)
      .then((data) => {
        if (cancelled) return;
        setStreams(data.streams);
        if (data.current_stream_id != null) setCurrentStreamId(String(data.current_stream_id));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session.channel_id, sourceDisabled]);

  function ask(title, message, confirmLabel, color, onConfirm) {
    setConfirm({ title, message, confirmLabel, color, onConfirm });
  }

  async function handleSwitch(value) {
    if (sourceDisabled || !value || value === currentStreamId) return;
    setSwitching(true);
    try {
      await switchSource(session.channel_id, Number(value));
      setCurrentStreamId(value);
      notifications.show({ message: 'Source switched', color: 'green' });
      onChanged?.();
    } catch (err) {
      notifications.show({ message: err.message, color: 'red' });
    } finally {
      setSwitching(false);
    }
  }

  async function loadClients() {
    if (sourceDisabled) return;
    setClientsLoading(true);
    try {
      const detail = await sessionDetail(session.channel_id);
      setClients(detail.clients || []);
    } catch {
      // keep whatever we already have
    } finally {
      setClientsLoading(false);
    }
  }

  async function handleDisconnect(clientId) {
    try {
      if (onDisconnect) {
        await onDisconnect(clientId);
      } else {
        await disconnectClient(session.channel_id, clientId);
      }
      setClients((cs) => cs.filter((c) => c.client_id !== clientId));
      notifications.show({ message: disconnectSuccessMessage, color: 'green' });
      onChanged?.();
    } catch (err) {
      notifications.show({ message: err.message, color: 'red' });
    }
  }

  async function handleStopStream() {
    try {
      if (onStop) {
        await onStop();
      } else {
        await stopChannel(session.channel_id);
      }
      notifications.show({ message: stopSuccessMessage, color: 'green' });
      onChanged?.();
    } catch (err) {
      notifications.show({ message: err.message, color: 'red' });
    }
  }

  const name = session.channel_name || `Channel ${session.channel_id}`;
  const stateColor = resolveStatusColor(session.state, STATE_COLORS);
  const speed = session.ffmpeg_speed != null ? parseFloat(session.ffmpeg_speed) : null;

  const streamOptions = (streams || []).map((s) => ({
    value: String(s.id),
    label: s.provider ? `${s.name} [${s.provider}]` : s.name,
    name: s.name,
    provider: s.provider,
    stats: s.stats,
  }));

  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
          <Image
            src={logoUrl || channelLogoUrl(session.channel_id)}
            alt=""
            h={28}
            w={28}
            fit="contain"
            radius="sm"
            style={{ flexShrink: 0 }}
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
          />
          <Text fw={600} truncate>
            {name}
          </Text>
        </Group>
        <Group gap={6} wrap="nowrap">
          <Tooltip label={statusLabel || (session.state === 'active' ? 'Live' : session.state || 'unknown')}>
            <ThemeIcon
              color={statusColor || stateColor}
              variant="light"
              radius="xl"
              size="sm"
            >
              {StatusIcon ? <StatusIcon size={14} /> : session.state === 'active' ? <IconPlayerPlay size={14} /> : <IconLoader2 size={14} />}
            </ThemeIcon>
          </Tooltip>
          <Tooltip label="Stop stream">
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={() =>
                ask(
                  stopLabel,
                  stopMessage || `Stop the stream for ${name}? All connected clients will be disconnected.`,
                  stopLabel,
                  'red',
                  handleStopStream,
                )
              }
            >
              <IconSquareX size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Select
        label="Source"
        name={`source-switch-stream-${session.channel_id}`}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={streams === null ? 'Loading…' : 'Select a source'}
        data={streamOptions}
        value={currentStreamId}
        onChange={handleSwitch}
        disabled={sourceDisabled || switching || streams === null}
        mb="sm"
        maxDropdownHeight={320}
        styles={{
          input: { userSelect: 'none', WebkitUserSelect: 'none' },
          option: { userSelect: 'none', WebkitUserSelect: 'none' },
        }}
        renderOption={({ option, checked }) => (
          <Stack gap={2} py={2} style={{ width: '100%' }}>
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Text size="sm" truncate style={{ minWidth: 0, flex: 1 }}>
                {option.name}
              </Text>
              {checked && <IconCheck size={14} style={{ flexShrink: 0 }} />}
            </Group>
            {option.provider && (
              <Text size="xs" c="dimmed" truncate>
                {option.provider}
              </Text>
            )}
            {option.stats && (
              <StreamStatsBadges
                stats={option.stats}
                size="xs"
                justify="flex-start"
              />
            )}
          </Stack>
        )}
      />

      <div style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
        <ProgramTimeline programme={programme} session={session} mode={timelineMode} />
      </div>
      <SessionStatsBlock session={session} speed={speed} hideClientCount={hideClientCount} />

      <Accordion
        value={expanded}
        onChange={(value) => {
          setExpanded(value);
          if (value) loadClients();
        }}
        styles={{ item: { borderBottom: 'none' } }}
      >
        <Accordion.Item value="clients">
          <Accordion.Control>Connected clients ({session.client_count ?? clients.length})</Accordion.Control>
          <Accordion.Panel>
            {clientsLoading ? (
              <Center py="sm">
                <Loader size="sm" />
              </Center>
            ) : clients.length === 0 ? (
              <Text size="sm" c="dimmed">
                No connected clients
              </Text>
            ) : (
              <Stack gap="xs">
                {clients.map((c) => (
                  <Group key={c.client_id} justify="space-between" wrap="nowrap">
                    <div style={{ minWidth: 0 }}>
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm" truncate>
                          {c.ip_address || 'unknown'}
                        </Text>
                        <Badge size="xs" variant="light" color={c.username === 'Anonymous' ? 'gray' : 'blue'}>
                          {c.username || 'Anonymous'}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed" truncate>
                        {c.user_agent || 'unknown'}
                      </Text>
                      {(c.output_format || c.output_profile_name) && (
                        <Group gap="xs" mt={2} wrap="nowrap">
                          {c.output_format && (
                            <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                              Container: {c.output_format}
                            </Text>
                          )}
                          {c.output_profile_name && (
                            <Text size="xs" c="dimmed" truncate style={{ minWidth: 0 }}>
                              Output Profile: {c.output_profile_name}
                            </Text>
                          )}
                        </Group>
                      )}
                    </div>
                    <Tooltip label="Disconnect">
                      <ActionIcon
                        color="red"
                        variant="subtle"
                        onClick={() =>
                          ask(
                            'Disconnect Client',
                            `Disconnect ${c.ip_address || 'this client'}?`,
                            'Disconnect',
                            'red',
                            () => handleDisconnect(c.client_id),
                          )
                        }
                      >
                        <IconUserOff size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                ))}
              </Stack>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <ConfirmModal action={confirm} onClose={() => setConfirm(null)} />
    </Card>
  );
}
