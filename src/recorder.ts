export class Recorder {
  private recorder: MediaRecorder | null = null;
  constructor(private onUnexpectedStop: () => void = () => {}) {}
  static supported(canvas: HTMLCanvasElement) {
    return typeof MediaRecorder !== 'undefined' && typeof canvas.captureStream === 'function';
  }
  start(canvas: HTMLCanvasElement) {
    if (!Recorder.supported(canvas))
      throw new Error('이 브라우저는 녹화를 지원하지 않아요. Chrome 또는 Edge에서 열어 주세요.');
    if (this.recorder) return;
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) =>
      MediaRecorder.isTypeSupported(t)
    );
    const stream = canvas.captureStream(30);
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { videoBitsPerSecond: 5000000, ...(mimeType ? { mimeType } : {}) });
    } catch (e) {
      for (const track of stream.getTracks()) track.stop();
      throw e;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      for (const track of stream.getTracks()) track.stop();
      if (this.recorder === rec) {
        this.recorder = null;
        this.onUnexpectedStop();
      }
      if (!chunks.length) return;
      const actualType = rec.mimeType || chunks[0].type;
      const url = URL.createObjectURL(new Blob(chunks, { type: actualType }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `바울핀볼_${new Date().toISOString().replace(/[:.]/g, '-')}.${actualType.includes('mp4') ? 'mp4' : 'webm'}`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    };
    try {
      rec.start(1000);
    } catch (e) {
      for (const track of stream.getTracks()) track.stop();
      throw e;
    }
    this.recorder = rec;
  }
  stop() {
    const rec = this.recorder;
    this.recorder = null;
    if (rec && rec.state !== 'inactive') rec.stop();
  }
}
