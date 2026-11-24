const liveChannelId = '11111111-1111-4111-8111-111111111111';
const audioStreams = [
  { index: 1, audio_language: 'eng', audio_codec: 'aac', audio_channels: 'stereo', audio_bitrate: 128, sample_rate: 48000 },
  { index: 2, audio_language: 'spa', audio_codec: 'ac3', audio_channels: '5.1', audio_bitrate: 384 },
  { pid: 256, audio_language: 'fra' },
];

function json(response, data, status = 200) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(data));
}

function iso(timestamp) {
  return new Date(timestamp).toISOString();
}

export function mockApi() {
  return {
    name: 'source-switch-mock-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url, 'http://localhost').pathname;
        if (!path.startsWith('/api/')) return next();

        const now = Date.now();
        if (path === '/api/auth/token') return json(response, { access: 'dev-token', refresh: 'dev-refresh' });
        if (path === '/api/auth/refresh') return json(response, { access: 'dev-token' });
        if (path === '/api/sessions') {
          return json(response, {
            count: 1,
            sessions: [{
              channel_id: liveChannelId,
              channel_name: 'Demo Live Channel',
              state: 'active',
              started_at: now / 1000 - 1200,
              uptime: 1200,
              avg_bitrate: '6.25 Mbps',
              client_count: 2,
              stream_id: 101,
              stream_profile_name: 'Passthrough',
              m3u_profile_name: 'Primary Provider',
              resolution: '1920x1080',
              source_fps: 29.97,
              video_codec: 'h264',
              audio_codec: 'ac3',
              audio_channels: '5.1',
              audio_language: 'spa',
              audio_streams: audioStreams,
              stream_type: 'hls',
              ffmpeg_speed: 1.02,
              cushion_remaining: 0,
              clients: [
                {
                  client_id: 'live-1',
                  ip_address: '192.168.1.20',
                  username: 'alex',
                  user_agent: 'AppleCoreMedia/1.0',
                  output_format: 'fmp4',
                  output_profile_name: 'Apple TV 1080p',
                },
                {
                  client_id: 'live-2',
                  ip_address: '192.168.1.21',
                  username: 'sam',
                  user_agent: 'VLC/3.0',
                  output_format: 'mpegts',
                },
              ],
            }],
          });
        }
        if (path === '/api/media-connections') {
          return json(response, {
            vod_connections: [
              {
                content_type: 'movie',
                content_uuid: '22222222-2222-4222-8222-222222222222',
                content_name: 'Demo Movie',
                connections: [{
                  client_id: 'vod-movie-1',
                  client_ip: '192.168.1.30',
                  username: 'taylor',
                  user_agent: 'Infuse',
                  duration: 540,
                  bytes_sent: 734003200,
                  m3u_profile: { profile_name: 'Movies Provider' },
                }],
              },
              {
                content_type: 'episode',
                content_uuid: '33333333-3333-4333-8333-333333333333',
                content_name: 'Demo Series - S02E04',
                connections: [{
                  client_id: 'vod-episode-1',
                  client_ip: '192.168.1.31',
                  username: 'morgan',
                  user_agent: 'Apple TV',
                  duration: 1320,
                  bytes_sent: 1073741824,
                  m3u_profile: { profile_name: 'Series Provider' },
                }],
              },
            ],
            timeshift_sessions: [{
              session_id: 'catchup-1',
              channel_uuid: liveChannelId,
              channel_name: 'Demo Catch-up Channel',
              programme_start: '2026-09-03:14-00',
              source: { id: 103, name: 'Catch-up Source', provider: 'Catch-up Provider' },
              resolution: '1280x720',
              source_fps: 25,
              video_codec: 'h264',
              audio_codec: 'aac',
              audio_channels: '2.0',
              audio_streams: audioStreams,
              stream_type: 'hls',
              connections: [{
                client_id: 'catchup-1',
                session_id: 'catchup-1',
                ip_address: '192.168.1.40',
                username: 'jordan',
                user_agent: 'TiviMate',
                duration: 800,
                bytes_streamed: 314572800,
                avg_bitrate_kbps: 2800,
                m3u_profile: { profile_name: 'Catch-up Provider' },
              }],
            }],
          });
        }
        if (path === '/api/live/programmes') {
          return json(response, {
            programmes: [{
              channel_uuid: liveChannelId,
              title: 'Live Programme Title',
              sub_title: 'Episode subtitle',
              description: 'A representative live EPG description.',
              start_time: iso(now - 1800000),
              end_time: iso(now + 1800000),
              duration_secs: 3600,
            }],
          });
        }
        if (path === '/api/catchup/programmes') {
          return json(response, {
            sessions: [{
              session_id: 'catchup-1',
              title: 'Catch-up Programme Title',
              sub_title: 'Archived episode',
              description: 'A representative catch-up EPG description.',
              start_time: iso(now - 3600000),
              end_time: iso(now),
              duration_secs: 3600,
            }],
          });
        }
        if (/^\/api\/channels\/[^/]+\/streams$/.test(path)) {
          return json(response, {
            streams: [
              { id: 101, name: 'Primary Source', provider: 'Primary Provider', stats: { audio_streams: audioStreams, audio_codec: 'ac3', audio_channels: '5.1', join_prebuffer_seconds: 4.25 } },
              { id: 102, name: 'Fallback Source', provider: 'Backup Provider', stats: { audio_codec: 'aac', audio_channels: 'stereo' } },
            ],
            current_stream_id: 101,
          });
        }
        if (path.includes('/logo')) return json(response, { error: 'Not found' }, 404);
        return json(response, { status: 'success' });
      });
    },
  };
}
