import { useState } from 'react';
import { Badge, Group, Modal, Stack, Text, Tooltip } from '@mantine/core';
import { audioFields, audioSummary, audioTracks } from '../utils/streamStats.js';

export default function AudioStats({ stats, size, interactive = true, onOpenedChange }) {
  const [opened, setOpened] = useState(false);
  const tracks = audioTracks(stats);
  const primary = tracks.length ? tracks[0] : stats;
  const summary = primary?.audio_codec ? String(primary.audio_codec).toUpperCase() : audioSummary(primary) || (tracks.length ? 'Audio track 1' : '');
  const extra = tracks.length - 1;
  const details = tracks.length ? tracks : summary ? [stats] : [];
  if (!summary && !opened) return null;

  return (
    <>
      {summary && <Tooltip label={interactive ? 'Show audio track details' : 'Audio track'}>
        <Badge
          size={size}
          variant="light"
          color="pink"
          component={interactive ? 'button' : 'span'}
          {...(interactive ? { type: 'button', onClick: () => { setOpened(true); onOpenedChange?.(true); }, 'aria-label': `Show ${details.length} audio ${details.length === 1 ? 'track' : 'tracks'}` } : {})}
          style={interactive ? { cursor: 'pointer' } : undefined}
        >
          {summary}{extra > 0 && <span style={{ opacity: 0.6, marginLeft: 4 }}>+{extra}</span>}
        </Badge>
      </Tooltip>}
      {interactive && <Modal opened={opened} onClose={() => { setOpened(false); onOpenedChange?.(false); }} title="Audio tracks">
        {details.length ? <Stack gap="md">
          {details.map((track, index) => {
            const fields = audioFields(track);
            return <div key={index}>
              <Text fw={600} size="sm">Track {index + 1}</Text>
              {fields.length ? fields.map(([label, value]) => (
                <Group key={label} justify="space-between" gap="sm" wrap="nowrap">
                  <Text size="sm" c="dimmed">{label}</Text><Text size="sm" ta="right">{value}</Text>
                </Group>
              )) : <Text size="sm" c="dimmed">No details available</Text>}
            </div>;
          })}
        </Stack> : <Text size="sm" c="dimmed">Audio track details are no longer available.</Text>}
      </Modal>}
    </>
  );
}
