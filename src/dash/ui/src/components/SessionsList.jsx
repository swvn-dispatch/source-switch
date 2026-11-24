import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell, Stack, Text, SimpleGrid, Center, Loader } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconRefresh } from '@tabler/icons-react';
import { AppHeader } from '@swvn-dispatch/dispatch-ui-kit';
import logoUrl from '/logo.png';
import { catchupProgrammes, getUsername, listSessions, liveProgrammes, mediaConnections } from '../api.js';
import SessionCard from './SessionCard.jsx';
import VodConnectionCard from './VodConnectionCard.jsx';
import CatchupConnectionCard from './CatchupConnectionCard.jsx';
import { programmeRequest } from '../utils/catchupPlayback.js';

const POLL_MS = 5000;

export default function SessionsList({ onLoggedOut }) {
  const [sessions, setSessions] = useState(null);
  const [preferences, setPreferences] = useState({});
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [vod, setVod] = useState([]);
  const [catchup, setCatchup] = useState([]);
  const [programmes, setProgrammes] = useState({});
  const [liveProgrammeByChannel, setLiveProgrammeByChannel] = useState({});
  const programmesRef = useRef({});
  const isDesktop = useMediaQuery('(min-width: 48em)');

  const refresh = useCallback(async () => {
    try {
      const [liveResult, mediaResult] = await Promise.allSettled([listSessions(), mediaConnections()]);
      if (liveResult.status === 'rejected') throw liveResult.reason;

      const sorted = [...liveResult.value.sessions].sort(
        (a, b) => (a.started_at ?? Infinity) - (b.started_at ?? Infinity),
      );
      setSessions(sorted);
      setPreferences(liveResult.value.preferences || {});
      const liveData = await liveProgrammes(sorted.map((session) => session.channel_id));
      setLiveProgrammeByChannel(Object.fromEntries(
        (liveData.programmes || []).map((programme) => [programme.channel_uuid, programme]),
      ));
      if (mediaResult.status === 'fulfilled') {
        const media = mediaResult.value;
        const nextCatchup = media.timeshift_sessions || [];
        setVod(media.vod_connections || []);
        setCatchup(nextCatchup);
        if (nextCatchup.length > 0) {
          const data = await catchupProgrammes(
            nextCatchup.map((session) => programmeRequest(session, programmesRef.current[session.session_id])),
          );
          const bySession = Object.fromEntries(
            (data.sessions || []).map((programme) => [programme.session_id, programme]),
          );
          programmesRef.current = bySession;
          setProgrammes(bySession);
        } else {
          programmesRef.current = {};
          setProgrammes({});
        }
      } else {
        throw mediaResult.reason;
      }
      setError(null);
    } catch (err) {
      setError(err.message);
      if (err.message.includes('expired')) onLoggedOut();
    }
  }, [onLoggedOut]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  async function handleManualRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  const visibleTypes = Array.isArray(preferences.session_types) ? preferences.session_types : ['live', 'vod', 'catchup'];
  const visibleLive = visibleTypes.includes('live') ? sessions || [] : [];
  const visibleVod = visibleTypes.includes('vod') ? vod : [];
  const visibleCatchup = visibleTypes.includes('catchup') ? catchup : [];
  const counts = [
    ...(visibleTypes.includes('live') ? [`${visibleLive.length} live`] : []),
    ...(visibleTypes.includes('vod') ? [`${visibleVod.reduce((count, item) => count + (item.connections?.length || 0), 0)} vod`] : []),
    ...(visibleTypes.includes('catchup') ? [`${visibleCatchup.reduce((count, item) => count + (item.connections?.length || 0), 0)} catch-up`] : []),
  ];
  const cards = [
    ...visibleLive.map((session) => ({
      id: `live-${session.channel_id}`,
      startedAt: session.started_at || 0,
      node: <SessionCard session={session} programme={liveProgrammeByChannel[session.channel_id]} onChanged={refresh} preferences={preferences} />,
    })),
    ...visibleVod.flatMap((content) => (content.connections || []).map((connection) => ({
      id: `vod-${connection.client_id}`,
      startedAt: Number(connection.connected_at) || 0,
      node: <VodConnectionCard content={content} connection={connection} onChanged={refresh} preferences={preferences} />,
    }))),
    ...visibleCatchup.flatMap((session) => (session.connections || []).map((connection) => ({
      id: `catchup-${connection.client_id}`,
      startedAt: Number(connection.connected_at) || 0,
      node: <CatchupConnectionCard session={session} connection={connection} programme={programmes[session.session_id]} onChanged={refresh} preferences={preferences} />,
    }))),
  ].sort((a, b) => a.startedAt - b.startedAt);

  return (
    <AppShell header={{ height: 56 }}>
      <AppHeader
        logoUrl={logoUrl}
        appName="Source Switch"
        version={__APP_VERSION__}
        githubUrl="https://github.com/swvn-dispatch/source-switch"
        username={getUsername()}
        onLogout={onLoggedOut}
        actions={[
          { key: 'refresh', label: 'Refresh', icon: IconRefresh, onClick: handleManualRefresh, loading: refreshing },
        ]}
      />

      <AppShell.Main>
        <Stack p="md" maw={860} mx="auto">
          {error && (
            <Text c="red" size="sm">
              {error}
            </Text>
          )}

          {sessions !== null && counts.length > 0 && <Text size="xs" c="dimmed">{counts.join(', ')}</Text>}
          {sessions === null ? (
            <Center py="xl">
              <Loader />
            </Center>
          ) : cards.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              {visibleTypes.length ? 'No active connections for the selected session types' : 'No session types selected'}
            </Text>
          ) : (
            <>
              {isDesktop ? (
                <SimpleGrid cols={2} spacing="md">
                  {[0, 1].map((column) => (
                    <Stack key={column} gap="md">
                      {cards.filter((_, index) => index % 2 === column).map((card) => (
                        <div key={card.id}>{card.node}</div>
                      ))}
                    </Stack>
                  ))}
                </SimpleGrid>
              ) : (
                <Stack gap="md">
                  {cards.map((card) => <div key={card.id}>{card.node}</div>)}
                </Stack>
              )}
            </>
          )}
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
