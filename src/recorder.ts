export class Recorder {
  private recorder: MediaRecorder | null = null;
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
      stream.getTracks().forEach((t) => t.stop());
      throw e;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (!chunks.length) return;
      const actualType = rec.mimeType || chunks[0].type;
      const url = URL.createObjectURL(new Blob(chunks, { type: actualType }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `마블핀볼_${new Date().toISOString().replace(/[:.]/g, '-')}.${actualType.includes('mp4') ? 'mp4' : 'webm'}`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    };
    rec.start(1000);
    this.recorder = rec;
  }
  stop() {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.recorder = null;
  }
}
