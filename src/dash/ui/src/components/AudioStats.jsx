import { useState } from 'react';
import { Badge, Group, Modal, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { audioFields, audioSummary, audioTracks } from '../utils/streamStats.js';

export default function AudioStats({ stats, size, interactive = true }) {
  const [opened, setOpened] = useState(false);
  const tracks = audioTracks(stats);
  const summary = tracks.length ? audioSummary(tracks[0]) || 'Audio track 1' : audioSummary(stats);
  const extra = tracks.length - 1;
  if (!summary && !opened) return null;

  return (
    <>
      {summary && <Group gap={4} wrap="nowrap">
        <Tooltip label="Audio track">
          <Badge size={size} variant="light" color="pink">{summary}</Badge>
        </Tooltip>
        {extra > 0 && (interactive ? (
          <UnstyledButton onClick={() => setOpened(true)} aria-label={`Show all ${tracks.length} audio tracks`}>
            <Text size="xs" c="dimmed" component="span">+{extra}</Text>
          </UnstyledButton>
        ) : <Text size="xs" c="dimmed" component="span">+{extra}</Text>)}
      </Group>}
      {interactive && <Modal opened={opened} onClose={() => setOpened(false)} title="Audio tracks">
        {tracks.length ? <Stack gap="md">
          {tracks.map((track, index) => {
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
