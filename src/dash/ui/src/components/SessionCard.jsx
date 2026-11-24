import { useEffect, useState } from 'react';
import { Card, Group, Text, Badge, Button, ScrollArea, Modal, Stack, ActionIcon, Tooltip, Loader, Center, Image, ThemeIcon } from '@mantine/core';
import { IconUser, IconUserOff, IconSquareX, IconVideo, IconCloudUpload, IconCheck, IconLoader2, IconPlayerPlay, IconList, IconArrowsRightLeft } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { ConfirmModal, resolveStatusColor } from '@swvn-dispatch/dispatch-ui-kit';
import { channelStreams, switchSource, disconnectClient, stopChannel, sessionDetail, channelLogoUrl } from '../api.js';
import ProgramTimeline from './ProgramTimeline.jsx';
import AudioStats from './AudioStats.jsx';
import fallbackLogo from '/logo.png';
import { audioSummary, audioTracks, compactResolution, duration, finiteNumber } from '../utils/streamStats.js';

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

function SourceSelect({ options, value, onChange, disabled, opened, onClose }) {
  const [audioOpened, setAudioOpened] = useState(false);
  return (
    <Modal opened={opened} onClose={onClose} title="Sources" trapFocus={!audioOpened} closeOnEscape={!audioOpened} closeOnClickOutside={!audioOpened}>
      <ScrollArea.Autosize mah={320} type="scroll">
        {options.length ? options.map((option) => (
              <Group key={option.value} wrap="nowrap" gap="sm" py="xs" justify="space-between">
                <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                  <Text size="sm" truncate>{option.name}</Text>
                  {option.provider && <Text size="xs" c="dimmed" truncate>{option.provider}</Text>}
                  {option.stats && <StreamStatsBadges stats={option.stats} size="xs" justify="flex-start" sourceOption audioInteractive onAudioOpenedChange={setAudioOpened} />}
                </Stack>
                <ActionIcon size="lg" variant="light" color="teal" disabled={disabled || option.value === value} aria-label={option.value === value ? 'Current source' : `Switch to ${option.name}`} onClick={() => { onChange(option.value); onClose(); }}>
                  {option.value === value ? <IconCheck size={16} /> : <IconArrowsRightLeft size={16} />}
                </ActionIcon>
              </Group>
        )) : <Text size="sm" c="dimmed">No sources available</Text>}
      </ScrollArea.Autosize>
    </Modal>
  );
}

export function StreamStatsBadges({
  stats,
  speed,
  size = 'xs',
  justify = 'center',
  style,
  sourceOption = false,
  audioInteractive = !sourceOption,
  onAudioOpenedChange,
  ...groupProps
}) {
  if (!stats) return null;
  const tracks = audioTracks(stats);
  const hasAudio = tracks.length > 0 || audioSummary(stats);
  const cushion = sourceOption ? null : duration(stats.cushion_remaining);
  const prebuffer = sourceOption ? duration(stats.join_prebuffer_seconds) : null;
  const hasAny =
    stats.resolution ||
    stats.source_fps ||
    stats.video_codec ||
    hasAudio ||
    stats.stream_type ||
    speed != null || cushion != null || prebuffer != null;
  return (
    <Group
      gap={4}
      justify={justify}
      {...groupProps}
      style={{
        display: hasAny ? undefined : 'none',
        flexWrap: 'wrap',
        justifyContent: justify,
        marginInline: justify === 'center' ? 'auto' : undefined,
        ...style,
      }}
    >
      {stats.resolution && (
        <Tooltip label={`Video resolution: ${stats.resolution}`}>
          <Badge size={size} variant="light" color="red">{compactResolution(stats.resolution)}</Badge>
        </Tooltip>
      )}
      {stats.source_fps && (
        <Tooltip label="Source frames per second">
          <Badge size={size} variant="light" color="orange">{Math.round(stats.source_fps)} FPS</Badge>
        </Tooltip>
      )}
      {stats.video_codec && (
        <Tooltip label="Video codec">
          <Badge size={size} variant="light" color="blue">{stats.video_codec.toUpperCase()}</Badge>
        </Tooltip>
      )}
      <AudioStats stats={stats} size={size} interactive={audioInteractive} onOpenedChange={onAudioOpenedChange} />
      {stats.stream_type && (
        <Tooltip label="Stream type">
          <Badge size={size} variant="light" color="cyan">{stats.stream_type.toUpperCase()}</Badge>
        </Tooltip>
      )}
      {speed != null && (
        <Tooltip label={`Current speed: ${speed.toFixed(2)}x`}>
          <Badge size={size} variant="light" color={speed >= SPEED_OK_THRESHOLD ? 'green' : 'red'}>{speed.toFixed(2)}x</Badge>
        </Tooltip>
      )}
      {cushion != null && (
        <Tooltip label="Remaining ingest buffer cushion">
          <Badge size={size} variant="light" color="gray">{cushion.toFixed(1)}s</Badge>
        </Tooltip>
      )}
      {prebuffer != null && (
        <Tooltip label="Measured join prebuffer">
          <Badge size={size} variant="light" color="gray">{prebuffer.toFixed(1)}s</Badge>
        </Tooltip>
      )}
    </Group>
  );
}

export function SessionStatsBlock({ session, speed, currentSource }) {
  const metrics = [
    { label: 'Uptime', value: formatUptime(session.uptime) },
    { label: 'Bitrate', value: session.avg_bitrate || '-' },
    ...(session.data_sent ? [{ label: 'Data Sent', value: session.data_sent }] : []),
  ];
  return (
    <>
      <Stack gap={4} mb="sm">
        <Group gap="xs" grow align="flex-start" mb="xs">
          {metrics.map(({ label, value }, index) => (
            <div key={label} style={{ textAlign: index === 0 ? 'left' : index === metrics.length - 1 ? 'right' : 'center' }}>
              <Text size="xs" c="dimmed">{label}</Text><Text size="sm">{value}</Text>
            </div>
          ))}
        </Group>
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
            <IconList size={14} /><Text size="sm" c="dimmed">Source</Text>
          </Group>
          <Tooltip label={currentSource.label} disabled={!currentSource.label}>
            <Text size="sm" truncate style={{ minWidth: 0, flex: 1 }} ta="right">
              {currentSource.primary}{currentSource.secondary && <Text component="span" inherit c="dimmed"> ({currentSource.secondary})</Text>}
            </Text>
          </Tooltip>
        </Group>
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
  const [clientsOpened, setClientsOpened] = useState(false);
  const [sourcesOpened, setSourcesOpened] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl, session.channel_id]);

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
    if (sourceDisabled) {
      setClients(session.clients || []);
      return;
    }
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
  const speed = finiteNumber(session.ffmpeg_speed);

  const streamOptions = (streams || []).map((s) => ({
    value: String(s.id),
    label: s.provider ? `${s.name} [${s.provider}]` : s.name,
    name: s.name,
    provider: s.provider,
    stats: s.stats,
  }));
  const selectedSource = streamOptions.find((option) => option.value === currentStreamId);
  const sourcePrimary = selectedSource?.provider || selectedSource?.name || (streams === null ? 'Loading…' : 'Unknown');
  const sourceSecondary = selectedSource?.provider && selectedSource.name !== selectedSource.provider ? selectedSource.name : null;
  const currentSource = {
    primary: sourcePrimary,
    secondary: sourceSecondary,
    label: sourceSecondary ? `${sourcePrimary} (${sourceSecondary})` : sourcePrimary,
  };

  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
          <Image
            src={logoFailed ? fallbackLogo : logoUrl || channelLogoUrl(session.channel_id)}
            alt=""
            h={28}
            w={28}
            fit="contain"
            radius="sm"
            style={{
              flexShrink: 0,
              filter: logoFailed ? 'grayscale(1)' : undefined,
              opacity: logoFailed ? 0.75 : undefined,
              padding: logoFailed ? 3 : undefined,
            }}
            onError={(e) => {
              if (logoFailed) e.currentTarget.style.visibility = 'hidden';
              else setLogoFailed(true);
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

      <div style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
        <ProgramTimeline programme={programme} session={session} mode={timelineMode} />
      </div>
      <SessionStatsBlock session={session} speed={speed} currentSource={currentSource} />

      <Group justify="center">
        <Button variant="light" size="xs" leftSection={<IconUser size={14} />} onClick={() => { setClientsOpened(true); loadClients(); }}>
          {session.client_count ?? clients.length} {(session.client_count ?? clients.length) === 1 ? 'client' : 'clients'}
        </Button>
        <Button variant="light" color="teal" size="xs" leftSection={<IconList size={14} />} disabled={streams === null} onClick={() => setSourcesOpened(true)}>
          {streamOptions.length} {streamOptions.length === 1 ? 'source' : 'sources'}
        </Button>
      </Group>
      <SourceSelect options={streamOptions} value={currentStreamId} onChange={handleSwitch} disabled={sourceDisabled || switching} opened={sourcesOpened} onClose={() => setSourcesOpened(false)} />
      <Modal opened={clientsOpened} onClose={() => setClientsOpened(false)} title="Connected clients">
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
                      {c.output_format && <Text size="xs" c="dimmed" mt={2}>Container: {c.output_format}</Text>}
                      {c.output_profile_name && <Text size="xs" c="dimmed" truncate>Output Profile: {c.output_profile_name}</Text>}
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
      </Modal>

      <ConfirmModal action={confirm} onClose={() => setConfirm(null)} />
    </Card>
  );
}
