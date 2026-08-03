import { AudioPipeline } from './sidecar/pipeline.ts';

/** CLI mode: always-on session. */
async function mainCli(): Promise<void> {
  let transcript = '';
  let emoLabel = '';
  let emoConf = 0;

  const pipeline = new AudioPipeline(process.cwd());

  pipeline.on('error', (err: any) => console.error(err));
  pipeline.on('ready', (data: any) => console.log(`Pipeline ready · model ${data.activeModel}`));

  await pipeline.initialize();
  pipeline.startRecording();
  console.log('Recording active (Ctrl+C to stop)');

  const shutdown = async () => {
    console.log('\nStopping recording...');
    const result = await pipeline.stopRecording();
    console.log('Transcript:', result.text);
    if (result.emotion) {
      console.log(`Emotion: ${result.emotion.label} (${(result.emotion.confidence * 100).toFixed(1)}%)`);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
}

mainCli().catch((e) => {
  console.error(e);
  process.exit(1);
});
