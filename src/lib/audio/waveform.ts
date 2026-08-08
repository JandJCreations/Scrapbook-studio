export function computeWaveformPeaks(
  buffer: AudioBuffer,
  numBuckets: number,
): number[] {
  const channelCount = buffer.numberOfChannels;
  const length = buffer.length;
  const bucketSize = Math.max(1, Math.floor(length / numBuckets));
  const peaks: number[] = [];

  const channelData: Float32Array[] = [];
  for (let c = 0; c < channelCount; c++) {
    channelData.push(buffer.getChannelData(c));
  }

  for (let bucket = 0; bucket < numBuckets; bucket++) {
    const start = bucket * bucketSize;
    const end = Math.min(length, start + bucketSize);
    let max = 0;

    for (let i = start; i < end; i++) {
      for (let c = 0; c < channelCount; c++) {
        const value = Math.abs(channelData[c][i]);
        if (value > max) max = value;
      }
    }

    peaks.push(max);
  }

  return peaks;
}
