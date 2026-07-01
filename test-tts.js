import { EdgeTTS } from 'node-edge-tts';
async function test() {
  const tts = new EdgeTTS({
    voice: 'th-TH-NiwatNeural',
    lang: 'th-TH',
    outputFormat: 'webm-24khz-16bit-mono-opus'
  });
  await tts.ttsPromise('ทดสอบ', 'test.webm');
  console.log('Done');
}
test();
