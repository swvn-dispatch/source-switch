import { useEffect, useState } from 'react';
import { Group, Progress, Stack, Text } from '@mantine/core';
import TapTooltip from './TapTooltip.jsx';

function clock(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ProgramTimeline({ programme, session, mode = 'live' }) {
  const [, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!programme?.title || !programme.start_time || !programme.end_time) return null;

  const start = new Date(programme.start_time).getTime();
  const end = new Date(programme.end_time).getTime();
  const duration = Math.max(1, end - start);
  const progress = mode === 'catchup'
    ? 100
    : Math.min(100, Math.max(0, ((Date.now() - start) / duration) * 100));
  return (
    <TapTooltip label={
      <Stack gap={4}>
        <Text size="xs" fw={700}>{programme.title}</Text>
        {programme.sub_title && <Text size="xs">{programme.sub_title}</Text>}
        {programme.description && <Text size="xs">{programme.description}</Text>}
      </Stack>
    } multiline maw={320} withArrow>
      <div>
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{clock(programme.start_time)}</Text>
          <Text size="xs" fw={600} truncate ta="center" style={{ minWidth: 0, flex: 1 }}>
            {programme.title}
          </Text>
          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{clock(programme.end_time)}</Text>
        </Group>
        <Progress
          value={progress}
          size="sm"
          color={mode === 'catchup' ? 'blue' : session?.paused ? 'yellow' : 'green'}
          striped
          animated
          mt={3}
          styles={{ section: { animationDuration: '1.25s' } }}
        />
      </div>
    </TapTooltip>
  );
}
